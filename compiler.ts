import llvm, { ConstantFP } from 'llvm-bindings';
import { last } from 'ramda';
import ts, {
  BinaryExpression,
  Block,
  CallExpression,
  ExpressionStatement,
  FunctionDeclaration,
  Identifier,
  Node,
  NumericLiteral,
  ParameterDeclaration,
  Program,
  ReturnStatement,
  SourceFile,
  Statement,
  StringLiteral,
  SyntaxKind,
  Type,
  TypeChecker,
  TypeFlags,
  VariableDeclaration,
  VariableStatement,
} from 'typescript';

function panic(message: string): never {
  throw new Error(message);
}

function todo(message?: string): never {
  panic(message ?? 'TODO! Not implemented yet');
}

interface Function {
  value: llvm.Function;
  returnType: llvm.Type;
}

interface Expression {
  value: llvm.Value;
  type: llvm.Type;
}

interface Variable extends Expression {}

export default class Compiler {
  #program: Program;
  #typeChecker: TypeChecker;

  constructor(program: Program) {
    this.#program = program;
    this.#typeChecker = program.getTypeChecker();
  }

  compile(resultFile: SourceFile) {
    // const main = llvm.Function.Create(
    //   llvm.FunctionType.get(llvm.Type.getVoidTy(this.#context), false),
    //   0,
    //   'main',
    //   this.#module,
    // );
    // const entryBB = llvm.BasicBlock.Create(this.#context, 'entry1', main);
    // this.#builder.SetInsertPoint(entryBB);
    this.#traverse(resultFile);
    // this.#builder.CreateRetVoid();
    this.#module.print('out.ll');
  }

  #resolveCallee(expression: ts.Expression) {
    switch (expression.kind) {
      case SyntaxKind.Identifier:
        return (expression as Identifier).text;
      default:
        todo();
    }
  }

  #compileStringLiteral({ text }: StringLiteral): Expression {
    const globalString = this.#builder.CreateGlobalString(
      text,
      '_globalstring' + ++this.#globalStringLastIndex,
      0,
      this.#module,
    );
    return {
      value: this.#builder.CreateBitCast(
        globalString,
        llvm.Type.getInt8PtrTy(this.#context),
      ),
      type: this.#getIntPtrTy(),
    };
  }

  #compileNumericLiteral({ text }: NumericLiteral): Expression {
    const value = Number.parseFloat(text);
    const type = this.#builder.getDoubleTy();
    return { value: ConstantFP.get(type, value), type };
  }

  #compileBinaryExpression({
    left,
    operatorToken,
    right,
  }: BinaryExpression): Expression {
    const lhs = this.#compileExpression(left).value;
    const rhs = this.#compileExpression(right).value;

    // TODO: handle non-compatible type adds

    let value: llvm.Value;
    switch (operatorToken.kind) {
      case SyntaxKind.PlusToken:
        value = this.#builder.CreateFAdd(lhs, rhs);
        break;
      case SyntaxKind.MinusToken:
        value = this.#builder.CreateFSub(lhs, rhs);
        break;
      case SyntaxKind.AsteriskToken:
        value = this.#builder.CreateFMul(lhs, rhs);
        break;
      case SyntaxKind.SlashToken:
        value = this.#builder.CreateFDiv(lhs, rhs);
        break;
      default:
        todo(
          `Can't compile this kind of binary operator yet: ${operatorToken.kind}`,
        );
    }

    return { value, type: value.getType() };
  }

  #compileIdentifier({ escapedText }: Identifier) {
    const variable = this.#variables[escapedText.toString()];
    if (!variable) {
      panic(`Identifier ${variable} is not defined`);
    }
    return variable;
  }

  #compileExpression(expression: ts.Expression): Expression {
    switch (expression.kind) {
      case SyntaxKind.StringLiteral:
        return this.#compileStringLiteral(expression as StringLiteral);
      case SyntaxKind.NumericLiteral:
        return this.#compileNumericLiteral(expression as NumericLiteral);
      case SyntaxKind.BinaryExpression:
        return this.#compileBinaryExpression(expression as BinaryExpression);
      case SyntaxKind.CallExpression:
        return this.#compileCallExpression(expression as CallExpression);
      case SyntaxKind.Identifier:
        return this.#compileIdentifier(expression as Identifier);
      default:
        todo(`Can't compile this kind of expression yet: ${expression.kind}`);
    }
  }

  #compileCallExpression(callExpression: CallExpression): Expression {
    const callee = callExpression.expression;
    const calleeName = this.#resolveCallee(callee);
    const fun = this.#functions[calleeName];
    if (!fun) {
      todo();
    }
    const args = callExpression.arguments
      .map(this.#compileExpression.bind(this))
      .map(exp => exp.value);
    return {
      value: this.#builder.CreateCall(fun.value, args),
      type: fun.returnType,
    };
  }

  #compileFunctionParam({ type, dotDotDotToken }: ParameterDeclaration) {
    switch (type?.kind) {
      case SyntaxKind.StringKeyword:
        return llvm.Type.getInt8PtrTy(this.#context);
      case SyntaxKind.ArrayType:
        if (dotDotDotToken) {
          return;
        }
        todo();
      case SyntaxKind.TypeReference:
        return this.#getIntPtrTy();
      default:
        todo(
          `Cannot compile this kind of function parameter yet: ${type?.kind}`,
        );
    }
  }

  #compileType(type: Type) {
    const { flags } = type;
    switch (flags) {
      case TypeFlags.Number:
        return llvm.Type.getDoubleTy(this.#context);
      case TypeFlags.Void:
        return llvm.Type.getVoidTy(this.#context);
      case TypeFlags.Object:
        return this.#getIntPtrTy();
      default:
        todo(`Can't compile this type flag yet: ${flags}`);
    }
  }

  #compileReturnStatement({ expression }: ReturnStatement) {
    if (expression) {
      this.#builder.CreateRet(this.#compileExpression(expression).value);
    } else {
      this.#builder.CreateRetVoid();
    }
  }

  #compileVariableDeclaration(variableDeclaration: VariableDeclaration) {
    if (!variableDeclaration.initializer) {
      panic('Variables must be initialized.');
    }
    const initializerExpression = this.#compileExpression(
      variableDeclaration.initializer,
    );
    const name = variableDeclaration.name.getText();
    this.#variables[name] = initializerExpression;
  }

  #compileVariableStatement({
    declarationList: { declarations },
  }: VariableStatement) {
    declarations.forEach(this.#compileVariableDeclaration.bind(this));
  }

  #compileStatement(statement: Statement) {
    switch (statement.kind) {
      case SyntaxKind.ReturnStatement:
        this.#compileReturnStatement(statement as ReturnStatement);
        break;
      case SyntaxKind.ExpressionStatement:
        this.#compileExpression((statement as ExpressionStatement).expression);
        break;
      case SyntaxKind.VariableStatement:
        this.#compileVariableStatement(statement as VariableStatement);
        break;
      default:
        todo(`Can't compile this kind of statement yet: ${statement.kind}`);
    }

    return false;
  }

  #compileBlock({ statements }: Block): { returns: boolean } {
    // TODO: how to deal with nested blocks? especially inside ifs/elses/etc?
    let returns = false;
    for (const statement of statements) {
      this.#compileStatement(statement);
      if (statement.kind === SyntaxKind.ReturnStatement) {
        returns = true;
      }
    }

    return { returns };
  }

  #getIntPtrTy() {
    return llvm.Type.getInt64PtrTy(this.#context);
  }

  #compileFunction(functionDeclaration: FunctionDeclaration): Function {
    const { parameters, name, modifiers, body } = functionDeclaration;
    const tsType = this.#typeChecker.getTypeAtLocation(functionDeclaration);
    let retType: llvm.Type;
    retType = this.#compileType(tsType.getCallSignatures()[0]!.getReturnType());
    const lastParam = last(parameters);
    const argTypes = parameters
      .map(this.#compileFunctionParam.bind(this))
      .filter(Boolean) as llvm.PointerType[];
    const functionType = llvm.FunctionType.get(
      retType,
      argTypes,
      // TODO: handle varargs
      !!lastParam?.dotDotDotToken,
    );
    // TODO: handle anonymous functions?
    const functionName = name!.text;
    const fn = llvm.Function.Create(
      functionType,
      llvm.Function.LinkageTypes.ExternalLinkage,
      functionName,
      this.#module,
    );
    const func: Function = {
      value: fn,
      returnType: retType,
    };
    this.#functions[functionName] = func;
    const firstModifier = modifiers ? modifiers[0] : undefined;
    if (firstModifier?.kind !== SyntaxKind.DeclareKeyword) {
      if (!body) {
        // TODO: add function location and filename in error
        panic(`Function doesn't have a body: ${functionName}`);
      }
      const entryBB = llvm.BasicBlock.Create(this.#context, 'entry', fn);
      this.#builder.SetInsertPoint(entryBB);
      const { returns } = this.#compileBlock(body);
      if (!returns) {
        this.#builder.CreateRetVoid();
      }
    }
    return func;
  }

  #traverse(node: Node) {
    switch (node.kind) {
      case SyntaxKind.SourceFile:
        (node as SourceFile).statements.forEach(this.#traverse.bind(this));
        break;
      case SyntaxKind.ExpressionStatement:
        this.#compileExpression((node as ExpressionStatement).expression);
        break;
      case SyntaxKind.FunctionDeclaration:
        this.#compileFunction(node as FunctionDeclaration);
        break;
      case SyntaxKind.ReturnStatement:
        // TODO: source file position of error
        panic('Cannot return at top level');
      case SyntaxKind.TypeAliasDeclaration:
        break;
      default:
        todo(`This node kind is not traversable yet: ${node.kind}`);
    }
  }

  #context = new llvm.LLVMContext();
  #module = new llvm.Module('main', this.#context);
  #builder = new llvm.IRBuilder(this.#context);
  #functions: { [name: string]: Function } = {};
  #variables: { [name: string]: Variable } = {};
  #globalStringLastIndex = -1;
}
