import { execSync } from 'child_process';
import { chmodSync } from 'fs';
import { resolve } from 'path';
import {
  createProgram,
  getPreEmitDiagnostics,
  ModuleResolutionKind,
} from 'typescript';
import Compiler from './compiler';

console.log('Parsing');
const program = createProgram(['./tsn-src/example.ts'], {
  ...require('./tsconfig.json').compilerOptions,
  moduleResolution: ModuleResolutionKind.NodeJs,
  esModuleInterop: false,
  rootDir: resolve('./tsn-src'),
});
const compiler = new Compiler(program);

console.log(getPreEmitDiagnostics(program));
console.log(program.emit().diagnostics);
console.log('Compiling to llvm ir');
compiler.compile(program.getSourceFile('./tsn-src/example.ts')!);
console.log('Compiling object file');
execSync('llc -filetype=obj out.ll -o out.o');
console.log('Compiling executable');
execSync('clang out.o -o out');
chmodSync('out', '755');
