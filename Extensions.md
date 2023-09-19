# Extensions made

## TODO

- [ ] *Rewrite this in a statically typed language*
- [~] *Complete overhaul of error messages*
- ~[ ] *Initialization of static variables*~ IMPLEMENTATION NOT PLANNED
- [x] *Fix scope problems*
- [x] *Pointer Operator*
- [x] *Blank Common?*
- ~[ ] *Inline assembly*~ IMPLEMENTATION NOT PLANNED
- [ ] *Some type checking (for int and char at least)? DELAYED UNTIL REWRITE*
- [x] *Structs?*
- [ ] *Peephole optimizer*
- [x] *Static arrays in BSS/data*
- [~] *Array initialization*
- [x] *Enums*
- [x] *Private functions and methods*

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
- *Memory operators*: `@` gets a reference to an `int`, `#@` to a `char` (they are rvalues, assigning to their result is not possible), `!` and `#!` dereferences a term.`#[]` accesses the nth byte of an array `a#[n]`. Both are legal to use as terms in expresions and as lhs of assignements.
- *Static array initialization*: `static` class level arrays can be initialized and/or reserved spaced in the data segement thus: `static Array A[3] = {1, N, "HELLO"}, B[5]`, where `A` is pointed to an initialized array of three elements (initializers must be constant expressions, the string litteral is allocated in the data segment and it's pointer stored in the array), and `B` is a reserved space of 5 *words* in the static segment. Only word sized arrays (int) can be initialized thus. Byte arrays are essentially strings.
- *`private` subroutines*: classes can define `functions` and `methods` as `private`: a `private function void f(x)` is called inside the class that defines it as `do ClassName.f$(x)`, a `private method` call omits the class name. Object instances cannot call a private method. This is simple syntactic sugar for calling `ClassName.__private_f` at the moment, no visibility checking is performed.
- *Simple `struct` declaration*: structs are very lightweight, a thin wrapper on arrays, and based on BCPL and T3X semantics for them: `struct Type {a:n, b:n, c:n}`, where `n` is the size (in an abstract way) of the field (a constant positive integer), if ommited, it defaults to 1. This declaration creates class level constants such as `const Type_a = 0, const Type_b = Type_a + a:n, const Type_c = Type_b + b:n, Type = Type_c + 1;`, the type name is prepended to the field to avoid reserving too many names. Declaration and instancing of an object of a struct type can be done in various ways: `static Array A[Type]` will reserve space for the struct in the static segment, `static/var/field Type A` is mostly cosmetic and can be used as a pointer to this type, `let A = <StorageClass>.new(Type * sizeof(field))` can be used to allocate an object of a storage class (such as `Array`, `List`, `String`) that supports some kind of indexing, where the size of the type is multiplied by the resolution of the fields (1 for `char`, 4 for `int`, etc.). Struct objects, like any other object in Jack, are essentialy pointers, and manipulated by reference. To access a field one should just use the constant to index: `A[Type_a]`, `A#[Type_a]` or `A.getIndex(Type_a)` are all valid indexing expressions.
- *Simple `enum` declaration*: enums are also very lightweight and behave somewhat like structs. They don't introduce new types nor classes, but act rather like syntactic sugar on top of constant declarations: `enum {A:n, B:n, C:n}` where `n` is the desired value for the constant (the rules for `const` declarations apply). If no value is declared, the next will be assigned.
- *`use` declaration*: it must be the first declaration in the `class` and only appear once: `use { "file", "fileb"}`. It parses the files given (taking the directory of the class file as root) for `const`, `struct` and `enum` declarations, and makes them available to the class.
- *`function` pointers and indirect call*: the address of a `function` can be taken with the operator `$@`: `$@Class.f`. An arbitrary address can be called with the operator `$!`: `!$(expression)(a, b)` where expression can be any expression or an identifier (identifiers can omit the parenthesis). Keep in mind no typechecking, alignement or argument checking is performed, and that calling into an unmmaped page, illegal instruction, wrong alignement or method... will cause exceptions and problems.
- ***Very*** *simple import/export mechanism*: `export` is a statement that loads data objects at fixed possitions in a systemwide shared common area of memory: `export N {Global, Function}`, where `N` is an expression of an offset into the global vector (**must** be positive, the absolute value **will** be taken), and `Global` and `Function` are terms representing either values or pointers. Thus, a constant can be exported `export N {CONSTANT}`, a variable as `export N {@a}` (keep in mind locals cannot be exported) and a function `export N {$@f}`. It is **not** possible to export `anchors`. The values are exported beginning at the offset specified, and subsequent exports will load from the next machine word. Imports are terms, and are performed with the operator `::`: `let f = ::N;`, where `N` is an expression of the offset in the global vector to import. `f` can then be used as a function pointer, pointer, value as normal.

## Notes

- Operator evaluation remains from left to right. I like it this way and it is easy enogh to remember.
- Remember that filenames must be the same name as the class, and both capitalized!
- I decided against implementing inline assembly because it is extremely machine dependent, and interfacing jack with assembly routines is trivial through wrappers, function pointers, or in some cases natively (just shape the label as ClassName.routine). The only cumbersome thing about this interface is managing the call convention, but that can be easily done with macros.
- I also decided against implementing initialization for `var`, `static` and `field` declarations, because, although a bit more verbose, following the procedural paradigm here seems to lead to better and more understandable code.