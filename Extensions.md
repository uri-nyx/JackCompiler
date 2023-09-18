# Extensions made

## TODO

- [ ] *Rewrite this in a statically typed language*
- [~] *Complete overhaul of error messages*
- [ ] *Initialization of static variables*
- [x] *Fix scope problems*
- [x] *Pointer Operator*
- [ ] *Blank Common?*
- [ ] *Inline assembly*
- [ ] *Some type checking (for int and char at least)?*
- [ ] *Structs?*
- [ ] *Peephole optimizer*
- [x] *Static arrays in BSS/data*
- [~] *Array initialization*
- [ ] *Enums*

## Optimizations

- *String optimizations*: new literal strings don't call into the standard library, they get constructed on the fly and allocated sequentially in a string pool (`data` section). They comply with the object memory representation of the class Array.

## Language Extensions

- *Hexadecimal literals*: prepended by the prefix `0x`, in the C style.
- *Character literals*: ecnlosed by single quotes `'`, the sequence `'''` is valid.
- *Assignments don't need the keyword `let`: you can assign as this `x = y;`, and can use let to assign various values in the same line: `let x = y, z = a;`.
- *Named constants*: only integer, must be declared at the top of the class or subroutine with `const A = n, B = m;`, or as with `var`, i.e: in diferent lines.
- *Single statement `if` and `while` statements whithout braces*: `if (x) do f();` and `while (x) n = n - 1;` are now allowed. It is handy for one liners and `else if` constructs, however, beware of the *dangling else* problem.
- *`break` and `continue` statements: to be used inside loops.
- *`for` loops*: imperative-style `for (var type x, z; x = n, z = m; x+z < 1000; x = x + 1, z = z + 1) do f(x, z);`. Locals for control of the loop can be declared, but only one type, and they are automatically initialized to 0.
- *New operators*: added `%` integer remainder, `<=` less or equal, `>=` greater or equal, `~=` not equal, `^` bitwise xor, `>>` shift right arithmetic, `>>>` shift right logical, `<<` shift left (logical); and compund assignment operators `^=`, `+=`, `-=`, `*=`, `/=`, `&=`, `|=`; logical operators `&&` and logical, and  `||` or logical (short-circuting); and ternary operator `x = n ? true : false`.
- *Local variables inside nested scopes*: scopes are introduced by braces `{}`, and declarations can shadow symbols in outer scopes. For loops can also optionally declare variables in their initialization.
- *Goto statement and label declaration*: `goto` jumps to a label declared within the class, `goto label;`, `anchor` declares a label (labels don't shadow other symbols), `anchor label:`.
- *Memory operators*: `@` gets a reference to an `int`, `@c` to a `char` (they are rvalues, assigning to their result is not possible), `!` and `!c` dereferences a term.`#[]` accesses the nth byte of an array `a#[n]`. Both are legal to use as terms in expresions and as lhs of assignements.
- *Static array initialization*: `static` class level arrays can be initialized and/or reserved spaced in the data segement thus: `static Array A[3] = {1, N, "HELLO"}, B[5]`, where `A` is pointed to an initialized array of three elements (initializers must be constant expressions, the string litteral is allocated in the data segment and it's pointer stored in the array), and `B` is a reserved space of 5 *words* in the static segment. Only word sized arrays (int) can be initialized thus. Byte arrays are essentially strings.

## Notes

- Operator evaluation remains from left to right. I like it this way and it is easy enogh to remember.
- Remember that filenames must be the same name as the class, and both capitalized!