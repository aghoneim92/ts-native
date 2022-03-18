declare function fprintf(file: File, str: string, ...args: any[]): void;
declare function printf(str: string, ...args: any[]): void;
declare function fopen(name: string, mode: string): File;
declare function initWindow(): void;

function foo() {
  return 1 + 1;
}

export function main() {
  initWindow();
}
