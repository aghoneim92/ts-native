"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
function foo() {
    return 1 + 1;
}
function main() {
    const file = fopen('out.txt', 'w');
    fprintf(file, 'Hello, World %f\n', foo());
}
exports.main = main;
