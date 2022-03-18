; ModuleID = 'main'
source_filename = "main"

@_globalstring0 = private unnamed_addr constant [8 x i8] c"out.txt\00", align 1
@_globalstring1 = private unnamed_addr constant [2 x i8] c"w\00", align 1
@_globalstring2 = private unnamed_addr constant [17 x i8] c"Hello, World %f\0A\00", align 1

declare void @fprintf(i64*, i8*, ...)

declare void @printf(i8*, ...)

declare i64* @fopen(i8*, i8*)

define double @foo() {
entry:
  ret double 2.000000e+00
}

define void @main() {
entry:
  %0 = call i64* @fopen(i8* getelementptr inbounds ([8 x i8], [8 x i8]* @_globalstring0, i32 0, i32 0), i8* getelementptr inbounds ([2 x i8], [2 x i8]* @_globalstring1, i32 0, i32 0))
  %1 = call double @foo()
  call void (i64*, i8*, ...) @fprintf(i64* %0, i8* getelementptr inbounds ([17 x i8], [17 x i8]* @_globalstring2, i32 0, i32 0), double %1)
  ret void
}
