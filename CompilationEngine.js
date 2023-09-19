const fs = require('fs');
const path = require('path');
const { JackTokenizer, TokenTypes, TokenKeywords } = require('./JackTokenizer');
const { SymbolTable, SymbolTableKinds } = require('./SymbolTable');
const { VMWriter, Segments, Commands } = require('./VMWriter');
const { assert } = require('console');
const { exit } = require('yargs');

const { KEYWORD, SYMBOL, IDENTIFIER, INT_CONST, STRING_CONST } = TokenTypes;
const {
  CLASS, METHOD, FUNCTION, CONSTRUCTOR, INT, BOOLEAN, CHAR, VOID, VAR, STATIC, FIELD, LET,
  DO, IF, ELSE, WHILE, FOR, RETURN, TRUE, FALSE, NULL, THIS, CONST, BREAK, CONTINUE, GOTO, 
  ANCHOR, PRIVATE, STRUCT, ENUM, USE, EXPORT
} = TokenKeywords;
const tokenMethod = new Map([
  [KEYWORD, JackTokenizer.prototype.keyword],
  [SYMBOL, JackTokenizer.prototype.symbol],
  [IDENTIFIER, JackTokenizer.prototype.identifier],
  [INT_CONST, JackTokenizer.prototype.intVal],
  [STRING_CONST, JackTokenizer.prototype.stringVal]
]);
const TYPE_RULE = [INT, CHAR, BOOLEAN, IDENTIFIER];
const KEYWORD_CONSTANT = [TRUE, FALSE, NULL, THIS];
const segment = kind => {
  if (kind === SymbolTableKinds.STATIC) { return Segments.STATIC; }
  else if (kind === SymbolTableKinds.FIELD) { return Segments.THIS; }
  else if (kind === SymbolTableKinds.VAR) { return Segments.LOCAL; }
  else if (kind === SymbolTableKinds.ARG) { return Segments.ARG; }
  else if (kind === SymbolTableKinds.CLASS_CONST) { return Segments.CONST; }
  else if (kind === SymbolTableKinds.LOCAL_CONST) { return Segments.CONST; }
}

class CompilationEngine {
  constructor(dir, inputFile, outputFile, enableLog = false, enableExtensions = false) {
    this.dir = dir;
    this.inputFile = inputFile;
    this.tk = new JackTokenizer(inputFile);
    this.st = new SymbolTable();
    this.vw = new VMWriter(outputFile);
    this.indentLevel = 0;
    this.enableLog = enableLog;
    this.enableExtensions = enableExtensions;
    this.labelGen = this.labelGenerator();
    this.continueLabel = null; 
    this.breakLabel = null;
    this.genLabel = controlFlow => {
      this.labelGen.next();;
      return this.labelGen.next(controlFlow).value;
    }

    if (enableLog) {
      this.outputFile = fs.openSync(outputFile + '_symbol.xml', 'w+');
    }

    if (this.tk.hasMoreTokens()) {
      this.tk.advance(); // set the first token
    }

    this.logWrapper(this.compileClass, 'class');
  }

  getToken(tokenType) {
    return tokenMethod.get(tokenType).call(this.tk);
  }

  *labelGenerator() {
    const id = {};
    while (true) {
      const controlFlow = yield;

      if (!this.className || !this.subroutineName) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tCannot generate label from emtpy class/function name (hint: '${this.tk.line}')`);
        process.exit(1);
      }

      if (!['while', 'if', 'for'].includes(controlFlow)) {
        throw Error("Arg must be one of 'if', 'while', 'else', 'for'");
      }

      const key = this.className + this.subroutineName + controlFlow;
      if (typeof id[key] === 'undefined') {
        id[key] = 0;
      } else {
        id[key]++;
      }

      if (controlFlow === 'while') {
        yield [`.${this.subroutineName}_WHILE_EXP_${id[key]}`, `.${this.subroutineName}WHILE_END_${id[key]}`];
      } else if (controlFlow === 'if') {
        yield [`.${this.subroutineName}_IF_FALSE_${id[key]}`, `.${this.subroutineName}IF_END_${id[key]}`];
      } else if (controlFlow === 'for') {
        yield [`.${this.subroutineName}_FOR_TEST_${id[key]}`, `.${this.subroutineName}_FOR_INCR_${id[key]}`,
               `.${this.subroutineName}_FOR_BODY_${id[key]}`, `.${this.subroutineName}_FOR_END_${id[key]}`];
      } 
    }
  }

  log({ type, data } = {}) {
    if (!this.enableLog) return;
    let str;

    if (type === 'identifierToken') {
      let config = [];
      const { category, defined, kind, index, identifier } = data;
      if (category) {
        config.push(`category="${category}"`);
      }

      if (kind) {
        config.push(`kind="${kind.display}"`);
      }

      if (typeof index === 'number') {
        config.push(`index="${index}"`);
      }

      if (defined) {
        config.push('defined');
      } else {
        config.push('used');
      }

      str = `<identifier${' ' + config.join(' ')}> ${identifier} </identifier>`;
    } else if (type === 'currentToken') {
      const thisTokenType = this.tk.tokenType();
      let thisToken = this.getToken(thisTokenType);

      if (this.tokenOneOf([STRING_CONST, SYMBOL])) {
        // escape special characters in XML
        thisToken = thisToken.replace(/(")|(<)|(>)|(&)/g, (m, quote, lt, gt, amp) => {
          if (quote) { return '&quot;'; }
          else if (lt) { return '&lt;'; }
          else if (gt) { return '&gt;'; }
          else if (amp) { return '&amp;'; }
        });
      }

      str = `<${thisTokenType.display}> ${thisToken.display || thisToken} </${thisTokenType.display}>`
    } else if (type === 'raw') {
      str = data;
    }

    fs.appendFileSync(this.outputFile, '  '.repeat(this.indentLevel) + str + '\n');
  }

  logWrapper(compileCb, tag, ...cbArgs) {
    this.log({ type: 'raw', data: `<${tag}>` });
    this.indentLevel++;
    const retVal = compileCb.apply(this, cbArgs);
    this.indentLevel--;
    this.log({ type: 'raw', data: `</${tag}>` });
    return retVal;
  }

  tokenOneOf(accepted) {
    const thisTokenType = this.tk.tokenType();
    const thisToken = this.getToken(thisTokenType);

    return (Array.isArray(accepted) && accepted.includes(thisToken)) ||
      (Array.isArray(accepted) && accepted.includes(thisTokenType)) ||
      (accepted === thisToken) ||
      (accepted === thisTokenType);
  }

  eat(accepted) {
    let ate = { token: this.getToken(this.tk.tokenType()), tokenType: this.tk.tokenType() };

    if (this.tokenOneOf(accepted)) {
      this.tk.tokenType() !== IDENTIFIER && this.log({ type: 'currentToken' });
      if (this.tk.hasMoreTokens()) {
        this.tk.advance();
      }
    } else {
      var sym = accepted.description;
      console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
      \tExpected '${accepted.display ||sym}', got '${ate.token.display}' (hint: '${this.tk.line}')`);
      process.exit(1);
    }

    return ate;
  }

  compileClass() {
    this.eat(CLASS);
    const { token: identifier } = this.eat(IDENTIFIER);
    this.log({
      type: 'identifierToken', data: {
        category: 'className',
        defined: true,
        kind: SymbolTableKinds.NONE,
        identifier
      }
    });
    this.className = identifier;

    this.eat('{');

    if (this.tokenOneOf([USE]) && this.enableExtensions) {
      this.compileUse();
    }

    while (this.tokenOneOf([STATIC, FIELD, CONST, STRUCT, ENUM])) {
      this.logWrapper(this.compileClassVarDec, 'classVarDec');
    }

    while (this.tokenOneOf([PRIVATE, CONSTRUCTOR, FUNCTION, METHOD])) {
      this.logWrapper(this.compileSubroutineDec, 'subroutineDec');
    }

    this.eat('}');
  }

  compileUse() {
    this.eat(USE);
    this.eat('{');
    const {token: fname} = this.eat(STRING_CONST);
    const old_tk = this.tk;

    const declarations = path.format({
      dir: this.dir,
      base: fname,
    });

    this.tk = new JackTokenizer(declarations);
    if (this.tk.hasMoreTokens()) {
      this.tk.advance(); // set the first token
      while (this.tokenOneOf([CONST, STRUCT, ENUM])) {
        if (this.tokenOneOf([CONST])) this.compileConstDec(SymbolTableKinds.CLASS_CONST);
        else if (this.tokenOneOf([STRUCT])) this.compileStructDec();
        else if (this.tokenOneOf([ENUM])) this.compileEnumDec();
      }
    }

    this.tk = old_tk

    while (this.tokenOneOf(',')) {
      this.eat(',');
      const {token: fname} = this.eat(STRING_CONST);
      const old_tk = this.tk;

      const declarations = path.format({
        dir: this.dir,
        base: fname,
      });
  
      this.tk = new JackTokenizer(declarations);
      if (this.tk.hasMoreTokens()) {
        this.tk.advance(); // set the first token
        while (this.tokenOneOf([CONST, STRUCT, ENUM])) {
          if (this.tokenOneOf([CONST])) this.compileConstDec(SymbolTableKinds.CLASS_CONST);
          else if (this.tokenOneOf([STRUCT])) this.compileStructDec();
          else if (this.tokenOneOf([ENUM])) this.compileEnumDec();
        }
      }
      this.tk = old_tk
    }
    this.eat('}');
  }

  compileExportStatement() {
    assert(this.enableExtensions);
    this.eat(EXPORT); // export N {Function, FunctionB, Function};
    this.compileExpression();
    this.vw.writePop(Segments.TEMP, 3); // offset into global pointer
    this.eat('{');
    this.compileTerm();
    this.vw.writePopCommon(3); // Pop Common auto-increments the offset

    while (this.tokenOneOf([','])) {
      this.eat(',');
      this.compileTerm();
      this.vw.writePopCommon(3);
    }

    this.eat('}');
  }

  compileClassVarDec() {
    if (this.enableExtensions) { 
      while (this.tokenOneOf([CONST])) {
        this.logWrapper(this.compileConstDec, 'constDec', SymbolTableKinds.CLASS_CONST);
      }
      while (this.tokenOneOf([ENUM])) {
        this.logWrapper(this.compileEnumDec, 'enumDec', SymbolTableKinds.CLASS_CONST);
      }
      while (this.tokenOneOf([STRUCT])) {
        this.logWrapper(this.compileStructDec, 'structtDec', SymbolTableKinds.CLASS_CONST);
      }
    }

    if (!this.tokenOneOf([STATIC, FIELD])) {return;}

    const { token: type } = this.eat([STATIC, FIELD]);

    let kind;
    if (type === STATIC) { kind = SymbolTableKinds.STATIC; }
    else if (type === FIELD) { kind = SymbolTableKinds.FIELD; }

    const { token: typeIdentifier, tokenType } = this.eat(TYPE_RULE);
    tokenType === IDENTIFIER && this.log({
      type: 'identifierToken', data: {
        category: 'className',
        defined: false,
        kind: SymbolTableKinds.NONE,
        identifier: typeIdentifier
      }
    })

    const { token: identifier } = this.eat(IDENTIFIER);
    this.st.define(identifier, typeIdentifier.display || typeIdentifier, kind);
    if (["Array"].includes(typeIdentifier) && this.tokenOneOf(['[']) && kind === SymbolTableKinds.STATIC  && this.enableExtensions) {
      this.parseStaticArray(identifier);
    }
    this.log({
      type: 'identifierToken', data: {
        category: "varName",
        kind,
        defined: true,
        index: this.st.indexOf(identifier),
        identifier
      }
    });

    while (this.tokenOneOf(',')) {
      this.eat(',');

      const { token: identifier } = this.eat(IDENTIFIER);
      this.st.define(identifier, typeIdentifier.display || typeIdentifier, kind);
      if (["Array"].includes(typeIdentifier) && this.tokenOneOf(['[']) && kind === SymbolTableKinds.STATIC  && this.enableExtensions) {
        this.parseStaticArray(identifier);
      }
      this.log({
        type: 'identifierToken', data: {
          category: "varName",
          kind,
          defined: true,
          index: this.st.indexOf(identifier),
          identifier
        }
      });
    }
    this.eat(';');
  }

  parseStaticArray(identifier) {
    let sz;
    this.eat('[');
    const { token: size} = this.eat([INT_CONST, IDENTIFIER]);
    if (this.st.kindOf(size) === SymbolTableKinds.CLASS_CONST) sz = this.st.indexOf(size);
    else sz = size;
    this.eat(']');
    if (this.tokenOneOf(['='])) {
      this.eat('=');
      this.initStaticArray(this.st.indexOf(identifier), sz);
    } else {
      this.vw.resStaticArray(this.st.indexOf(identifier), sz);
    }
  }

  initStaticArray(id, size) {
    this.eat('{');
    let array = [];
    for (let i = 0; i < size; i++) {
      if (this.tokenOneOf([INT_CONST])) {
        const {token: n} = this.eat(INT_CONST);
        array[i] = n;
      } else if (this.tokenOneOf([IDENTIFIER])) {
        const {token: ident} = this.eat(IDENTIFIER);
        if (this.st.kindOf(ident) === SymbolTableKinds.CLASS_CONST)
          array[i] = this.st.indexOf(ident);
        else {
          console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
          \tStatic array initializers can only contain constant expressions: ${ident} (hint: '${this.tk.line}')`);
          exit(1);
        }
      } else if (this.tokenOneOf([STRING_CONST])) {
        const {token: s} = this.eat(STRING_CONST);
        let l = `s${id}${size}`;
        this.vw.writeConstString(l, s);
        array[i] = l;
      } else {
        const tk = this.getToken(this.tk.tokenType());
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tStatic array initializers can only contain constant expressions: ${tk} (hint: '${this.tk.line}')`);
        exit(1);
      }
      if (i < size-1) this.eat(',');
    }
    this.eat('}');
    this.vw.writeStaticArray(id, size, array);
  }

  compileConstDec(kind) {
    this.eat(CONST);

    const { token: identifier } = this.eat(IDENTIFIER);
    this.log({
      type: 'identifierToken', data: {
        category: "constName",
        kind,
        defined: true,
        index: null,
        identifier
      }
    });
    this.eat('=');
    if (this.tokenOneOf(['-', '+', '~'])) {
      const { token }  = this.eat(['-', '+', '~'])
      const { token: n, tokenType } = this.eat(INT_CONST);

      let constant;
      if (token === '-') constant = -n;
      if (token === '~') constant = ~n;
      if (token === '+') constant = +n;

      this.st.define(identifier, tokenType, kind, constant);
    } else {
      const { token: n, tokenType } = this.eat(INT_CONST);
      this.st.define(identifier, tokenType, kind, n);
    }

    while (this.tokenOneOf(',')) {
      this.eat(',');

      const { token: identifier } = this.eat(IDENTIFIER);
      this.log({
        type: 'identifierToken', data: {
          category: "constName",
          kind,
          defined: true,
          index: null,
          identifier
        }
      });

      this.eat('=');

      if (this.tokenOneOf(['-', '+', '~'])) {
        const { token }  = this.eat(['-', '+', '~'])
        const { token: n, tokenType } = this.eat(INT_CONST);
  
        let constant;
        if (token === '-') constant = -n;
        if (token === '~') constant = ~n;
        if (token === '+') constant = +n;
  
        this.st.define(identifier, tokenType, kind, constant);
      } else {
        const { token: n, tokenType } = this.eat(INT_CONST);
        this.st.define(identifier, tokenType, kind, n);
      }
    }
    this.eat(';');
  }

  compileEnumDec() {
    this.eat(ENUM);

    this.eat('{');
    let current = 0;
    const { token: identifier } = this.eat(IDENTIFIER);
    if (this.tk.symbol() == ':') {
      this.eat(':');
      if (this.tokenOneOf(['-', '+', '~'])) {
        const { token }  = this.eat(['-', '+', '~'])
        const { token: n, tokenType } = this.eat(INT_CONST);
  
        let constant;
        if (token === '-') constant = -n;
        if (token === '~') constant = ~n;
        if (token === '+') constant = +n;
  
        current = constant
      } else {
        const { token: n, tokenType } = this.eat(INT_CONST);
        current = n;
      }
    }

    this.st.define(`${identifier}`, INT_CONST, SymbolTableKinds.CLASS_CONST, current);
    current++;

    while (this.tokenOneOf(',')) {
      this.eat(',');
      const { token: identifier } = this.eat(IDENTIFIER);
      if (this.tk.symbol() == ':') {
        this.eat(':');
        if (this.tokenOneOf(['-', '+', '~'])) {
          const { token }  = this.eat(['-', '+', '~'])
          const { token: n, tokenType } = this.eat(INT_CONST);
    
          let constant;
          if (token === '-') constant = -n;
          if (token === '~') constant = ~n;
          if (token === '+') constant = +n;
    
          current = constant
        } else {
          const { token: n, tokenType } = this.eat(INT_CONST);
          current = n;
        }
      }
      this.st.define(`${identifier}`, INT_CONST, SymbolTableKinds.CLASS_CONST, current);
      current++;
    }
    this.eat('}');
  }

  compileStructDec() {
    this.eat(STRUCT);

    const { token: base } = this.eat(IDENTIFIER);
    this.eat('{');
    let offset = 0;
    let size = 1;
    const { token: identifier } = this.eat(IDENTIFIER);
    if (this.tk.symbol() == ':') {
      this.eat(':');
      const { token: s } = this.eat(INT_CONST);
      size = s;
    }

    this.st.define(`${base}_${identifier}`, INT_CONST, SymbolTableKinds.CLASS_CONST, offset);
    offset += size;

    while (this.tokenOneOf(',')) {
      size = 1;
      this.eat(',');
      const { token: identifier } = this.eat(IDENTIFIER);
      if (this.tk.symbol() == ':') {
        this.eat(':');
        const { token: d } = this.eat(INT_CONST);
        size = d;
      }
      this.st.define(`${base}_${identifier}`, INT_CONST, SymbolTableKinds.CLASS_CONST, offset);
      offset += size;
    }
    this.st.define(`${base}`, INT_CONST, SymbolTableKinds.CLASS_CONST, offset);
    this.eat('}');
  }

  compileSubroutineDec() {
    this.st.startSubroutine();
    let subroutineType;
    let qualifier = "";
    if (this.tokenOneOf([PRIVATE]) && this.enableExtensions) {
      this.eat(PRIVATE);
      qualifier = "__private_"
      const { token: s } = this.eat([FUNCTION, METHOD]);
      subroutineType = s;

    } else {
      const { token: s } = this.eat([CONSTRUCTOR, FUNCTION, METHOD]);
      subroutineType = s;
    }

    if (subroutineType === METHOD) {
      this.st.define('this', this.className, SymbolTableKinds.ARG);
    }

    const { token: typeIdentifier, tokenType } = this.eat([VOID, ...TYPE_RULE]);
    tokenType === IDENTIFIER && this.log({
      type: 'identifierToken', data: {
        category: 'className',
        defined: false,
        kind: SymbolTableKinds.NONE,
        identifier: typeIdentifier
      }
    });

    const { token: identifier } = this.eat(IDENTIFIER);
    this.log({
      type: 'identifierToken', data: {
        category: 'subroutineName',
        defined: true,
        kind: SymbolTableKinds.NONE,
        identifier
      }
    });
    this.subroutineName = qualifier + identifier;

    this.eat('(');
    this.logWrapper(this.compileParameterList, 'parameterList');
    this.eat(')');
    this.logWrapper(this.compileSubroutineBody, 'subroutineBody', subroutineType);
  }

  compileParameterList() {
    if (this.tokenOneOf(TYPE_RULE)) {
      const { token: typeIdentifier, tokenType } = this.eat(TYPE_RULE);
      tokenType === IDENTIFIER && this.log({
        type: 'identifierToken', data: {
          category: 'className',
          defined: false,
          kind: SymbolTableKinds.NONE,
          identifier: typeIdentifier
        }
      });

      const { token: identifier } = this.eat(IDENTIFIER);
      this.st.define(identifier, typeIdentifier.display || typeIdentifier, SymbolTableKinds.ARG);
      this.log({
        type: 'identifierToken', data: {
          category: 'varName',
          defined: true,
          kind: SymbolTableKinds.ARG,
          index: this.st.indexOf(identifier),
          identifier
        }
      });

      while (this.tokenOneOf(',')) {
        this.eat(',');

        const { token: typeIdentifier, tokenType } = this.eat(TYPE_RULE);
        tokenType === IDENTIFIER && this.log({
          type: 'identifierToken', data: {
            category: 'className',
            defined: false,
            kind: SymbolTableKinds.NONE,
            identifier: typeIdentifier
          }
        });

        const { token: identifier } = this.eat(IDENTIFIER);
        this.st.define(identifier, typeIdentifier.display || typeIdentifier, SymbolTableKinds.ARG);
        this.log({
          type: 'identifierToken', data: {
            category: 'varName',
            defined: true,
            kind: SymbolTableKinds.ARG,
            index: this.st.indexOf(identifier),
            identifier
          }
        });
      }
    }
  }

  compileSubroutineBody(subroutineType) {
    this.eat('{');
    const old_vw = this.vw;
    this.vw = new VMWriter('temp');
    if (this.enableExtensions) {
      while (this.tokenOneOf([CONST])) {
        this.logWrapper(this.compileConstDec, 'constDec', SymbolTableKinds.LOCAL_CONST);
      }
    }
    while (this.tokenOneOf([VAR])) {
      this.logWrapper(this.compileVarDec, 'varDec');
    }


    if (subroutineType === CONSTRUCTOR) {
      this.vw.writePush(Segments.CONST, this.st.varCount(SymbolTableKinds.FIELD));
      this.vw.writeCall('Memory.alloc', 1);
      this.vw.writePop(Segments.POINTER, 0);
    } else if (subroutineType === METHOD) { // link the object (argument 0) with THIS segment
      this.vw.writePush(Segments.ARG, 0);
      this.vw.writePop(Segments.POINTER, 0);
    }

    this.logWrapper(this.compileStatements, 'statements');
    this.eat('}');
    
    const s = fs.readFileSync('temp.vm', 'utf-8');
    this.vw = old_vw;

    this.vw.writeFunction(
      `${this.className}.${this.subroutineName}`,
      this.st.varCount(SymbolTableKinds.VAR)
    );
    this.vw.write(s);
  }

  compileVarDec() {
    this.eat(VAR);

    var { token: typeIdentifier, tokenType } = this.eat(TYPE_RULE);
    tokenType === IDENTIFIER && this.log({
      type: 'identifierToken', data: {
        category: 'className',
        defined: false,
        kind: SymbolTableKinds.NONE,
        identifier: typeIdentifier
      }
    });

    var { token: identifier } = this.eat(IDENTIFIER);
    this.st.define(identifier, typeIdentifier.display || typeIdentifier, SymbolTableKinds.VAR);
    this.log({
      type: 'identifierToken', data: {
        category: 'varName',
        defined: true,
        kind: SymbolTableKinds.VAR,
        index: this.st.indexOf(identifier),
        identifier
      }
    });

    while (this.tokenOneOf(',')) {
      this.eat(',');

      const { token: identifier } = this.eat(IDENTIFIER);
      this.st.define(identifier, typeIdentifier.display || typeIdentifier, SymbolTableKinds.VAR);
      this.log({
        type: 'identifierToken', data: {
          category: 'varName',
          defined: true,
          kind: SymbolTableKinds.VAR,
          index: this.st.indexOf(identifier),
          identifier
        }
      });
    }

    this.eat(';');
  }

  compileStatements() {
    while (this.tokenOneOf(['!', '#!', IDENTIFIER, LET, IF, WHILE, DO, RETURN, CONTINUE, BREAK, FOR, GOTO, ANCHOR, EXPORT])) {
      this.logWrapper(this.compileStatement, 'statement');
    }
  }

  compileStatement() {
    if (this.enableExtensions && (this.tk.tokenType() === IDENTIFIER || this.tokenOneOf(['!', '#!']))) {
      this.logWrapper(this.compileAssignmentStatement, 'assignment statement');
    } else {
      const capitalized = this.tk.keyword().display[0].toUpperCase() + this.tk.keyword().display.slice(1);
      this.logWrapper(this[`compile${capitalized}Statement`], `${this.tk.keyword().display}Statement`);
    }
  }

  compileAnchorStatement() {
    assert(this.enableExtensions);
    this.eat(ANCHOR);
    const { token: identifier } = this.eat(IDENTIFIER);
    this.vw.writeLabel(`.${identifier}`);
    this.eat(':');
  }

  compileGotoStatement() {
    assert(this.enableExtensions);
    this.eat(GOTO);
    const { token: identifier } = this.eat(IDENTIFIER);
    this.vw.writeGoto(`.${identifier}`);
    this.eat(';');
  }

  compileContinueStatement() {
    assert(this.enableExtensions);
    if (this.continueLabel === null) {
      console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
      \t'continue' statement may only be used inside loops (hint: '${this.tk.line}')`);
      process.exit(1);
    }
    this.eat(CONTINUE);
    this.eat(';');
    this.vw.writeGoto(this.continueLabel);

  }

  compileBreakStatement() {
    assert(this.enableExtensions);
    if (this.breakLabel === null) {
      console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
      \t'break' statement may only be used inside loops (hint: '${this.tk.line}')`);
      process.exit(1);
    }
    this.eat(BREAK);
    this.eat(';');
    this.vw.writeGoto(this.breakLabel);
  }

  compileLetStatement() {
    this.eat(LET);
    this.logWrapper(this.compileAssignment, 'asignment');
    if (this.enableExtensions) {
      while (this.tokenOneOf(',')) {
        this.eat(',');
        this.logWrapper(this.compileAssignment, 'asignment');
      }
    }
    this.eat(';');
  }

  compileAssignments() {
    this.logWrapper(this.compileAssignment, 'asignment');
    if (this.enableExtensions) {
      while (this.tokenOneOf(',')) {
        this.eat(',');
        this.logWrapper(this.compileAssignment, 'asignment');
      }
    }
  }

  compileAssignmentStatement() {
    this.logWrapper(this.compileAssignment, 'asignment');
    this.eat(';')
  }

  compileReference() {
      if (this.tokenOneOf('(')) {
        this.eat('(');
        this.logWrapper(this.compileExpression, 'expression');
        this.eat(')');
      } else {
        const { token: identifier } = this.eat(IDENTIFIER);
        if ([Segments.CONST, Segments.POINTER, Segments.TEMP].includes(segment(this.st.kindOf(identifier)))) {
          console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
          \tCannot take a reference of a value in segment ${segment(this.st.kindOf(identifier))} (hint: '${this.tk.line}')`);
          exit(1);
        }
        if (this.st.typeOf(identifier) !== 'int') {
          console.log(`[WARNING]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
          \tTypecasting ${identifier} (type '${this.st.typeOf(identifier)}') to type 'int' (hint: '${this.tk.line}')`)
        }
        this.vw.writePushRef('int', segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
      }
  }

  compileFunctionPointer() {
    const { token: base } = this.eat(IDENTIFIER);
    this.eat('.');
    const { token: sub } = this.eat(IDENTIFIER);
    this.vw.writePushLabel(`${base}.${sub}`);
  }


  compileReferenceChar() {
    if (this.tokenOneOf('(')) {
      this.eat('(');
      this.logWrapper(this.compileExpression, 'expression');
      this.eat(')');
    } else {
      const { token: identifier } = this.eat(IDENTIFIER);
      if ([Segments.CONST, Segments.POINTER, Segments.TEMP].includes(segment(this.st.kindOf(identifier)))) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tCannot take a reference of a value in segment ${segment(this.st.kindOf(identifier))} (hint: '${this.tk.line}')`);
        exit(1);
      }
      if (this.st.typeOf(identifier) !== 'char') {
        console.log(`[WARNING]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tTypecasting ${identifier} (type '${this.st.typeOf(identifier)}') to type 'char' (hint: '${this.tk.line}')`)
      }
      this.vw.writePushRef('char', segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
    }
  }

  compileDereference() {
    if (this.tokenOneOf('(')) {
      this.eat('(');
      this.logWrapper(this.compileExpression, 'expression');
      this.eat(')');
    } else {
      const { token: identifier } = this.eat(IDENTIFIER);
      this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
    }
  }

  compileDereferenceChar() {
    if (this.tokenOneOf('(')) {
      this.eat('(');
      this.logWrapper(this.compileExpression, 'expression');
      this.eat(')');
    } else {
      const { token: identifier } = this.eat(IDENTIFIER);
      this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
    }
  }

  compileAssignment() {
    if (this.tokenOneOf(['!'])) { // address of
      this.eat('!');
      this.compileDereference()
      if (!this.tokenOneOf(['=', '^=', '+=', '-=', '*=', '/=', '&=', '|='])) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tAllowed assignment operators are: '=', '^=', '~=', '+=', '-=', '*=', '/=', '&=', '|=' (hint: '${this.tk.line}')`);
        process.exit(1);
      }

      const { token, tokenType } = this.eat(this.tk.symbol());
      if (token !== '=') {
        this.vw.writePop(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);


        this.vw.writePop(Segments.POINTER, 1);
        this.vw.writePush(Segments.THAT, 0);
        this.logWrapper(this.compileExpression, 'expression');
        this.compileAssignmentOperator(token);
      } else {
        this.logWrapper(this.compileExpression, 'expression');
      }
      this.vw.writePop(Segments.TEMP, 0);
      this.vw.writePop(Segments.POINTER, 1);
      this.vw.writePush(Segments.TEMP, 0);
      this.vw.writePop(Segments.THAT, 0);
      return;
    } else if (this.tokenOneOf(['#!'])) { // assign to address
      this.eat('#!');
      this.compileDereferenceChar()
      if (!this.tokenOneOf(['=', '^=', '+=', '-=', '*=', '/=', '&=', '|='])) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tAllowed assignment operators are: '=', '^=', '~=', '+=', '-=', '*=', '/=', '&=', '|=' (hint: '${this.tk.line}')`);
        process.exit(1);
      }

      const { token, tokenType } = this.eat(this.tk.symbol());
      if (token !== '=') {
        this.vw.writePop(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);


        this.vw.writePop(Segments.POINTER, 2);
        this.vw.writePush(Segments.THATB, 0);
        this.logWrapper(this.compileExpression, 'expression');
        this.compileAssignmentOperator(token);
      } else {
        this.logWrapper(this.compileExpression, 'expression');
      }
      this.vw.writePop(Segments.TEMP, 0);
      this.vw.writePop(Segments.POINTER, 2);
      this.vw.writePush(Segments.TEMP, 0);
      this.vw.writePop(Segments.THATB, 0);
      return;
    }
    const { token: identifier } = this.eat(IDENTIFIER);
    this.log({
      type: 'identifierToken', data: {
        category: 'varName',
        kind: this.st.kindOf(identifier),
        index: this.st.indexOf(identifier),
        defined: false,
        identifier
      }
    });

    if (!this.st.exists(identifier)) {
      console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
      \tUndefined symbol '${identifier}' (hint: '${this.tk.line}')`);
      process.exit(1);
    }

    if ([SymbolTableKinds.LOCAL_CONST, SymbolTableKinds.CLASS_CONST].includes(this.st.kindOf(identifier))) {
      console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
      \tCannot assign to constant (hint: '${this.tk.line}')`);
      process.exit(1);
    }

    if (this.tokenOneOf('[')) {
      this.eat('[');

      // push base address + index on stack
      this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
      this.logWrapper(this.compileExpression, 'expression');
      if (this.enableExtensions) {
        this.vw.writePush(Segments.CONST, 2);
        this.vw.writeCall('Math.shll', 2);
      }
      this.vw.writeArithmetic(Commands.ADD);

      this.eat(']');

      if (!this.tokenOneOf(['=', '^=', '+=', '-=', '*=', '/=', '&=', '|='])) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tAllowed assignment operators are: '=', '^=', '~=', '+=', '-=', '*=', '/=', '&=', '|=' (hint: '${this.tk.line}')`);
        process.exit(1);
      }

      const { token, tokenType } = this.eat(this.tk.symbol());
      if (token !== '=') {
        this.vw.writePop(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);


        this.vw.writePop(Segments.POINTER, 1);
        this.vw.writePush(Segments.THAT, 0);
        this.logWrapper(this.compileExpression, 'expression');
        this.compileAssignmentOperator(token);
      } else {
        this.logWrapper(this.compileExpression, 'expression');
      }
      this.vw.writePop(Segments.TEMP, 0);
      this.vw.writePop(Segments.POINTER, 1);
      this.vw.writePush(Segments.TEMP, 0);
      this.vw.writePop(Segments.THAT, 0);
    } else if (this.tokenOneOf('#')) {
      this.eat('#');
      this.eat('[');

      // push base address + index on stack
      this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
      this.logWrapper(this.compileExpression, 'expression');
      this.vw.writeArithmetic(Commands.ADD);

      this.eat(']');

      if (!this.tokenOneOf(['=', '^=', '+=', '-=', '*=', '/=', '&=', '|='])) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tAllowed assignment operators are: '=', '^=', '~=', '+=', '-=', '*=', '/=', '&=', '|=' (hint: '${this.tk.line}')`);
        process.exit(1);
      }

      const { token, tokenType } = this.eat(this.tk.symbol());
      if (token !== '=') {
        this.vw.writePop(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);


        this.vw.writePop(Segments.POINTER, 2);
        this.vw.writePush(Segments.THATB, 0);
        this.logWrapper(this.compileExpression, 'expression');
        this.compileAssignmentOperator(token);
      } else {
        this.logWrapper(this.compileExpression, 'expression');
      }
      this.vw.writePop(Segments.TEMP, 0);
      this.vw.writePop(Segments.POINTER, 2);
      this.vw.writePush(Segments.TEMP, 0);
      this.vw.writePop(Segments.THATB, 0);
    } else if (this.tokenOneOf('[')) {
      this.eat('[');

      // push base address + index on stack
      this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
      this.logWrapper(this.compileExpression, 'expression');
      this.vw.writeArithmetic(Commands.ADD);
      if (this.enableExtensions) {
        this.vw.writePush(Segments.CONST, 2);
        this.vw.writeCall('Math.shll', 2);
      }

      this.eat(']');

      if (!this.tokenOneOf(['=', '^=', '+=', '-=', '*=', '/=', '&=', '|='])) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tAllowed assignment operators are: '=', '^=', '~=', '+=', '-=', '*=', '/=', '&=', '|=' (hint: '${this.tk.line}')`);
        process.exit(1);
      }

      const { token, tokenType } = this.eat(this.tk.symbol());
      if (token !== '=') {
        this.vw.writePop(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);
        this.vw.writePush(Segments.TEMP, 0);


        this.vw.writePop(Segments.POINTER, 1);
        this.vw.writePush(Segments.THAT, 0);
        this.logWrapper(this.compileExpression, 'expression');
        this.compileAssignmentOperator(token);
      } else {
        this.logWrapper(this.compileExpression, 'expression');
      }
      this.vw.writePop(Segments.TEMP, 0);
      this.vw.writePop(Segments.POINTER, 1);
      this.vw.writePush(Segments.TEMP, 0);
      this.vw.writePop(Segments.THAT, 0);

    } else {
      if (!this.tokenOneOf(['=', '^=', '+=', '-=', '*=', '/=', '&=', '|='])) {
        console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
        \tAllowed assignment operators are: '=', '^=', '~=', '+=', '-=', '*=', '/=', '&=', '|=' (hint: '${this.tk.line}')`);
        process.exit(1);
      }
      const { token, tokenType } = this.eat(this.tk.symbol());
      if (token !== '=') {
        this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
        this.logWrapper(this.compileExpression, 'expression');

        this.compileAssignmentOperator(token);

        this.vw.writePop(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
      } else {
        this.logWrapper(this.compileExpression, 'expression');
        this.vw.writePop(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
      }
    }
  }

  compileAssignmentOperator(token) {
    if (token === '^=') this.vw.writeCall('Math.xor', 2);
    else if (token === '+=') this.vw.writeArithmetic(Commands.ADD);
    else if (token === '-=') this.vw.writeArithmetic(Commands.SUB);
    else if (token === '*=') this.vw.writeCall('Math.multipy', 2);
    else if (token === '/=') this.vw.writeCall('Math.divide', 2);
    else if (token === '&=') this.vw.writeArithmetic(Commands.AND);
    else if (token === '|=') this.vw.writeArithmetic(Commands.OR);
  }

  compileIfStatement() {
    this.eat(IF);
    this.eat('(');
    this.logWrapper(this.compileExpression, 'expression');

    this.vw.writeArithmetic(Commands.NOT);
    const [IF_FALSE, IF_END] = this.genLabel('if');
    this.vw.writeIf(IF_FALSE);

    this.eat(')');

    if (this.tokenOneOf([IDENTIFIER, KEYWORD]) && this.enableExtensions) {
      this.logWrapper(this.compileStatement, 'single_statement');
    } else {
      this.logWrapper(this.compileBlockStatement, 'block_statements');
    }

    if (this.tokenOneOf(ELSE)) {
      this.eat(ELSE);

      this.vw.writeGoto(IF_END);
      this.vw.writeLabel(IF_FALSE);

      if (this.tokenOneOf([IDENTIFIER, KEYWORD]) && this.enableExtensions) {
        this.logWrapper(this.compileStatement, 'single_statement');
      } else {
        this.logWrapper(this.compileBlockStatement, 'block_statements');
      } 

      this.vw.writeLabel(IF_END);

    } else {
      this.vw.writeLabel(IF_FALSE);
    }
  }

  compileForStatement() {
    if (!this.enableExtensions) {
      console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
      \tFor statements are an extension to the language, please use the -x flag(hint: '${this.tk.line}')`);
      process.exit(1);
    }
    this.st.nest();
    const oldContinueLabel = this.continueLabel;
    const oldBreakLabel = this.breakLabel;
    this.eat(FOR);
    this.eat('(');

    const [FOR_TEST, FOR_INCR, FOR_BODY, FOR_END] = this.genLabel('for');
    this.continueLabel = FOR_INCR;
    this.breakLabel = FOR_END;
    if (this.tokenOneOf([VAR])) // Locals can be declared
      this.logWrapper(this.compileVarDec, 'for_var_decl');
    if (this.tokenOneOf([IDENTIFIER]))
      this.logWrapper(this.compileAssignments, 'for_init');
    this.eat(';')
    this.vw.writeLabel(FOR_TEST);
    if (!this.tokenOneOf([';'])) {
      this.logWrapper(this.compileExpression, 'for_test');
      this.vw.writeIf(FOR_BODY);
    } else this.vw.writeGoto(FOR_BODY);
    this.eat(';');
    this.vw.writeGoto(FOR_END);
    this.vw.writeLabel(FOR_INCR);
    if (this.tokenOneOf([IDENTIFIER])) 
      this.logWrapper(this.compileAssignments, 'for_incr');
    this.vw.writeGoto(FOR_TEST);
    this.eat(')');

    this.vw.writeLabel(FOR_BODY);
    if (this.tokenOneOf([IDENTIFIER, KEYWORD]) && this.enableExtensions) {
      this.logWrapper(this.compileStatement, 'single_statements');
    } else {
      this.logWrapper(this.compileBlockStatement, 'block_statements');
    }
    this.vw.writeGoto(FOR_INCR);
    this.vw.writeLabel(FOR_END);
    this.continueLabel = oldContinueLabel;
    this.breakLabel = oldBreakLabel;
    this.st.unnest();
  }

  compileWhileStatement() {
    const oldContinueLabel = this.continueLabel;
    const oldBreakLabel = this.breakLabel;
    this.eat(WHILE);
    this.eat('(');

    const [WHILE_EXP, WHILE_END] = this.genLabel('while');
    this.continueLabel = WHILE_EXP;
    this.breakLabel = WHILE_END;
    this.vw.writeLabel(WHILE_EXP);
    this.logWrapper(this.compileExpression, 'expression');
    this.vw.writeArithmetic(Commands.NOT);
    this.vw.writeIf(WHILE_END);

    this.eat(')');

    if (this.tokenOneOf([IDENTIFIER, KEYWORD]) && this.enableExtensions) {
      this.logWrapper(this.compileStatement, 'single_statements');
    } else {
      this.logWrapper(this.compileBlockStatement, 'block_statements');
    }
    this.vw.writeGoto(WHILE_EXP);
    this.vw.writeLabel(WHILE_END);
    this.continueLabel = oldContinueLabel;
    this.breakLabel = oldBreakLabel;
  }

  compileBlockStatement() {
    this.st.nest();

    this.eat('{');
    while (this.tokenOneOf(VAR))
      this.logWrapper(this.compileVarDec, 'block_local');
    for (let i = 0; i < Object.keys(this.st.subScopes[this.st.subScopes.length - 1]).length; i++)
      this.vw.writePush(Segments.CONST, 0);
    this.logWrapper(this.compileStatements, 'block_statements');
    this.eat('}');
    this.st.unnest();
  }

  compileSubroutineCall(identifier) {
    const logData = { kind: this.st.kindOf(identifier), index: this.st.indexOf(identifier), defined: false, identifier };
    if (this.tk.symbol() === '.') {
      this.log({
        type: 'identifierToken', data: {
          ...logData,
          category: this.st.exists(logData.identifier) ? 'varName' : 'className'
        }
      });
      this.eat('.');

      const { token: subroutineName } = this.eat(IDENTIFIER);
      this.log({
        type: 'identifierToken', data: {
          category: 'subroutineName',
          kind: SymbolTableKinds.NONE,
          defined: false,
          identifier: subroutineName
        }
      });

      if (this.tk.symbol() === '$') {// calling private function 
        // check if we are in the class that defines the function
        if (identifier !== this.className) {
          console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
          \tCannot call private function ${subroutineName} outside its class (${identifier}) (hint: '${this.tk.line}')`);
          exit(1);
        }
        this.eat('$');
        this.eat('(');
        const nArgs = this.logWrapper(this.compileExpressionList, 'expressionList');
        this.vw.writeCall(`${identifier}.__private_${subroutineName}`, nArgs);
      } else {
        this.eat('(');
  
        if (this.st.exists(identifier)) { // calling a method on an object identifier
          // push the object base address
          this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
          const nArgs = this.logWrapper(this.compileExpressionList, 'expressionList') + 1;
          const className = this.st.typeOf(identifier);
          this.vw.writeCall(`${className}.${subroutineName}`, nArgs);
        } else { // calling a function
          const nArgs = this.logWrapper(this.compileExpressionList, 'expressionList');
          this.vw.writeCall(`${identifier}.${subroutineName}`, nArgs);
        }
      }

      this.eat(')');
    } else if (this.tk.symbol() === '(') { // calling method from the class that declares it
      this.log({ type: 'identifierToken', data: { ...logData, category: 'subroutineName' } });
      this.eat('(');
      if (this.st.exists('this')) { // inside another method
        this.vw.writePush(Segments.ARG, 0);
      } else { // inside constructor
        this.vw.writePush(Segments.POINTER, 0);
      }
      const nArgs = this.logWrapper(this.compileExpressionList, 'expressionList') + 1;
      this.vw.writeCall(`${this.className}.${identifier}`, nArgs);

      this.eat(')');
    }
    else if (this.tk.symbol() === '$') { // calling private method from the class that declares it
      this.eat('$');
      this.log({ type: 'identifierToken', data: { ...logData, category: 'subroutineName' } });
      this.eat('(');
      if (this.st.exists('this')) { // inside another method
        this.vw.writePush(Segments.ARG, 0);
      } else { // inside constructor
        this.vw.writePush(Segments.POINTER, 0);
      }
      const nArgs = this.logWrapper(this.compileExpressionList, 'expressionList') + 1;
      this.vw.writeCall(`${this.className}.__private_${identifier}`, nArgs);

      this.eat(')');
    } else {
      console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
      \tExpected '(' or '.' (hint: '${this.tk.line}')`);
      process.exit(1);
    }
  }

  compileCallIndirect() {

    if (this.tokenOneOf('(')) {
      this.eat('(');
      this.logWrapper(this.compileExpression, 'expression');
      this.eat(')');
    } else {
      const { token: identifier } = this.eat(IDENTIFIER);
      this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
    }

    this.eat('(');
    const nArgs = this.logWrapper(this.compileExpressionList, 'expressionList');
    this.vw.writeCallIndirect(nArgs);
    this.eat(')');
  }

  compileDoStatement() {
    this.eat(DO);
    if (this.tokenOneOf('$!')) {
      this.eat('$!');
      this.compileCallIndirect();
    } else {
      const { token: identifier } = this.eat(IDENTIFIER);
      this.compileSubroutineCall(identifier);
    }
    this.vw.writePop(Segments.TEMP, 0);
    this.eat(';');
  }

  compileReturnStatement() {
    this.eat(RETURN);
    if (this.tokenOneOf([INT_CONST, STRING_CONST, ...KEYWORD_CONSTANT, IDENTIFIER, '(', '-', '~', '@', '#@', '!', '#!', '$@', '$!'])) {
      this.logWrapper(this.compileExpression, 'expression');
    } else {
      this.vw.writePush(Segments.CONST, 0);
    }

    this.vw.writeReturn();
    this.eat(';');
  }

  compileExpression() {
    this.logWrapper(this.compileTerm, 'term');

    while (this.tokenOneOf(['+', '-', '*', '/', '&', '|', '<', '>', '=',
                            '%', '<=', '>=', '~=', '^', '>>', '>>>', '<<', '||', '&&', '?'])) {
      const { token, tokenType } = this.eat(this.tk.symbol());
      if (['||', '&&', '?'].includes(token) && this.enableExtensions) {
          this.compileLogicalOperator(token);
      } else {
        this.logWrapper(this.compileTerm, 'term');
  
        if (token === '+') { this.vw.writeArithmetic(Commands.ADD); }
        else if (token === '-') { this.vw.writeArithmetic(Commands.SUB); }
        else if (token === '*') { this.vw.writeCall('Math.multiply', 2); }
        else if (token === '/') { this.vw.writeCall('Math.divide', 2); }
        else if (token === '&') { this.vw.writeArithmetic(Commands.AND); }
        else if (token === '|') { this.vw.writeArithmetic(Commands.OR); }
        else if (token === '<') { this.vw.writeArithmetic(Commands.LT); }
        else if (token === '>') { this.vw.writeArithmetic(Commands.GT); }
        else if (token === '=') { this.vw.writeArithmetic(Commands.EQ); }
        else if (this.enableExtensions) {
          if (token === '%') { this.vw.writeCall('Math.mod', 2); }
          else if (token === '<=') { this.vw.writeCall('Math.le', 2); }
          else if (token === '>=') { this.vw.writeCall('Math.ge', 2); }
          else if (token === '~=') { this.vw.writeCall('Math.neq', 2); }
          else if (token === '^') { this.vw.writeCall('Math.xor', 2); }
          else if (token === '>>') { this.vw.writeCall('Math.shra', 2); }
          else if (token === '>>>') { this.vw.writeCall('Math.shrl', 2); }
          else if (token === '<<') { this.vw.writeCall('Math.shll', 2); }
        }
        else { 
          console.log(`[ERROR]:${this.inputFile}:${this.tk.lineno}:${this.tk.lineIndex} class ${this.className}:
          \tThis operation is only available enabling extensions (-x) (hint: '${this.tk.line}')`);
          process.exit(1);
        }
      }
    }
  }

  compileLogicalOperator(op) {
    if (op === '&&') {
      const [SHORT, END] = this.genLabel('if');
      this.vw.writeArithmetic(Commands.NOT);
      this.vw.writeIf(SHORT);
      this.logWrapper(this.compileTerm, 'term');
      this.vw.writeGoto(END);
      this.vw.writeLabel(SHORT);
      this.vw.writePush(Segments.CONST, 0); // false
      this.vw.writeLabel(END);
    }
    else if (op === '||') {
      const [SHORT, END] = this.genLabel('if');
      this.vw.writeIf(SHORT);
      this.logWrapper(this.compileTerm, 'term');
      this.vw.writeGoto(END);
      this.vw.writeLabel(SHORT);
      this.vw.writePush(Segments.CONST, -1); // true
      this.vw.writeLabel(END);
    } else if (op === '?') {
      const [IF_FALSE, IF_END] = this.genLabel('if');
      this.vw.writeArithmetic(Commands.NOT);
      this.vw.writeIf(IF_FALSE);
      this.logWrapper(this.compileExpression, 'true_expression');
      this.vw.writeGoto(IF_END);
      this.eat(":");
      this.vw.writeLabel(IF_FALSE);
      this.logWrapper(this.compileExpression, 'false_expression');
      this.vw.writeLabel(IF_END);
    }
  }

  compileTerm() {
    if (this.tokenOneOf(IDENTIFIER)) {
      const { token: identifier } = this.eat(IDENTIFIER);
      const logData = { kind: this.st.kindOf(identifier), defined: false, index: this.st.indexOf(identifier), identifier };

      if (this.tokenOneOf(['.', '(', '$'])) {
        this.compileSubroutineCall(identifier);
      } else if (this.tk.symbol() === '[') {
        this.log({ type: 'identifierToken', data: { ...logData, category: 'varName' } });
        this.eat('[');

        this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
        this.logWrapper(this.compileExpression, 'expression');
        if (this.enableExtensions) {
          this.vw.writePush(Segments.CONST, 2);
          this.vw.writeCall("Math.shll", 2)
        }
        this.vw.writeArithmetic(Commands.ADD);
        this.vw.writePop(Segments.POINTER, 1);
        this.vw.writePush(Segments.THAT, 0);

        this.eat(']');
      } else if (this.tk.symbol() === '#' && this.enableExtensions) {
        this.log({ type: 'identifierToken', data: { ...logData, category: 'varName' } });
        this.eat('#');
        this.eat('[');

        this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
        this.logWrapper(this.compileExpression, 'expression');
        this.vw.writeArithmetic(Commands.ADD);
        this.vw.writePop(Segments.POINTER, 2);
        this.vw.writePush(Segments.THATB, 0);

        this.eat(']');

      } else { // plain variable
        this.log({ type: 'identifierToken', data: { ...logData, category: 'varName' } });
        this.vw.writePush(segment(this.st.kindOf(identifier)), this.st.indexOf(identifier));
      }
    } else if (this.tokenOneOf('(')) {
      this.eat('(');
      this.logWrapper(this.compileExpression, 'expression');
      this.eat(')');

    } else if (this.tokenOneOf([STRING_CONST])) {
      const { token, tokenType } = this.eat(STRING_CONST);
      if (this.enableExtensions) {
        this.vw.writeConstString(null, token);
      } else {
        this.vw.writePush(Segments.CONST, token.length);
        this.vw.writeCall('String.new', 1);
        [...token].forEach((char, i) => {
          this.vw.writePush(Segments.CONST, char.charCodeAt());
          this.vw.writeCall('String.appendChar', 2)
        });
      }
    } else if (this.tokenOneOf(['-', '~', '@', '#@', '!', '#!', '$@', '$!', '::'])) { // unaryOp term
      const { token } = this.eat(this.tk.symbol());
      if (token === '@') {
        this.compileReference();
      } else if (token === '#@') {
        this.compileReferenceChar()
      } else if (token === '!'){
        this.compileDereference();
        this.vw.writePop(Segments.POINTER, 1);
        this.vw.writePush(Segments.THAT, 0);
      } else if (token === '#!'){
        this.compileDereferenceChar();
        this.vw.writePop(Segments.POINTER, 2);
        this.vw.writePush(Segments.THATB, 0);
      } else if (token === '$@') {
        this.compileFunctionPointer();
      } else if (token === '$!') {
        this.compileCallIndirect();
      }
      else {
        this.logWrapper(this.compileTerm, 'term');
  
        if (token === '-') {
          this.vw.writeArithmetic(Commands.NEG);
        } else if (token === '~') {
          this.vw.writeArithmetic(Commands.NOT);
        } else if (token === '::') { 
          this.vw.writePushCommon()
        }
      }
    } else {
      const { token, tokenType } = this.eat([INT_CONST, ...KEYWORD_CONSTANT]);

      if (tokenType === INT_CONST) {
        this.vw.writePush(Segments.CONST, token);
      } else if (token === NULL || token === FALSE) {
        this.vw.writePush(Segments.CONST, 0);
      } else if (token === TRUE) {
        this.vw.writePush(Segments.CONST, 1);
        this.vw.writeArithmetic(Commands.NEG);
      } else if (token === THIS) {
        if (this.st.exists('this')) { // we are in method
          this.vw.writePush(Segments.ARG, 0);
        } else { // we are in constructor
          this.vw.writePush(Segments.POINTER, 0);
        }
      }
    }
  }

  compileExpressionList() {
    let count = 0;
    if (this.tokenOneOf([INT_CONST, STRING_CONST, ...KEYWORD_CONSTANT, IDENTIFIER, '(', '-', '~', '!', '#!', '@', '#@'])) {
      this.logWrapper(this.compileExpression, 'expression');
      count++;

      while (this.tokenOneOf(',')) {
        this.eat(',');
        this.logWrapper(this.compileExpression, 'expression');
        count++;
      }
    }

    return count;
  }

  dispose() {
    if (!this.enableLog) return;
    fs.closeSync(this.outputFile);
    this.outputFile = null;
  }
}

exports.CompilationEngine = CompilationEngine;
