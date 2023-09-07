const {Enum} = require('./Enum');

const SymbolTableKinds = new Enum({
  NONE: {value: 0, description: 'none'},
  STATIC: {value: 1, description: 'static'},
  FIELD: {value: 2, description: 'field'},
  ARG: {value: 3, description: 'arg'},
  VAR: {value: 4, description: 'var'},
  CLASS_CONST: {value: 5, description: 'class_const'},
  LOCAL_CONST: {value: 6, description: 'LOCAL_const'},
});

const {NONE, STATIC, FIELD, ARG, VAR, CLASS_CONST, LOCAL_CONST} = SymbolTableKinds;

class SymbolTable {
  constructor() {
    this.maxVar = 0;
    this.classTable = {};
    this.subroutineTable = {};
    this.subScopes = [];
    this.varCounts = {
      [STATIC]: 0,
      [FIELD]: 0,
      [ARG]: 0,
      [VAR]: 0,
      [CLASS_CONST]: 0,
      [LOCAL_CONST]: 0
    };
  }

  // reset subroutine symbol table
  startSubroutine() {
    this.maxVar = 0;
    this.added  = [];
    this.subroutineTable = {};
    this.varCounts[ARG] = 0;
    this.varCounts[VAR] = 0;
    this.varCounts[LOCAL_CONST] = 0;
  }

  nest() {
    this.added.push(0);
    this.subScopes.push({});
  }

  unnest() {
    const added = this.added.pop();
    this.varCounts[VAR] -= added;
    this.subScopes.pop();
  }

  define(name, type, kind, value) {
  
    if ([STATIC, FIELD].includes(kind)) {
      this.classTable[name] = {type, kind, index: this.varCounts[kind.toString()]++};
    } else if ([ARG].includes(kind)) {
      this.subroutineTable[name] = { type, kind, index: this.varCounts[kind.toString()]++};
    } else if ([VAR].includes(kind)) {
      if (this.subScopes.length > 0){
        this.subScopes[this.subScopes.length - 1][name] = { type, kind, index: this.varCounts[kind.toString()]++};
        this.added[this.subScopes.length - 1] += 1;
      }
      else {
        this.subroutineTable[name] = { type, kind, index: this.varCounts[kind.toString()]++};
      }
      if (this.varCounts[kind.toString()] > this.maxVar) this.maxVar = this.varCounts[kind.toString()];
    } else if ([CLASS_CONST].includes(kind)) {
      this.classTable[name] = {type, kind, index: value};
      this.varCounts[kind.toString()]++;
    }  else if ([LOCAL_CONST].includes(kind)) {
      this.subroutineTable[name] = {type, kind, index: value};
      this.varCounts[kind.toString()]++;
    }
  }

  varCount(kind) {
    if ([VAR].includes(kind)) {
      return this.maxVar;
    } else {
      return this.varCounts[kind];
    }
  }

  kindOf(name) {
    const [nested, scope] = this.isNested(name);
    if (nested) {
      return this.subScopes[scope][name].kind;
    } else if (this.subroutineTable[name]) {
      return this.subroutineTable[name].kind;
    } else if (this.classTable[name]) {
      return this.classTable[name].kind;
    } else {
      return NONE;
    }
  }

  typeOf(name) {
    const [nested, scope] = this.isNested(name);
    if (nested) {
      return this.subScopes[scope][name].type;
    } else if (this.subroutineTable[name]) {
      return this.subroutineTable[name].type;
    } else if (this.classTable[name]) {
      return this.classTable[name].type;
    }
  }

  indexOf(name) {
    const [nested, scope] = this.isNested(name);
    if (nested && typeof this.subScopes[scope][name].index === 'number') {
      return this.subScopes[scope][name].index;
    } else if (this.subroutineTable[name] && typeof this.subroutineTable[name].index === 'number') {
      return this.subroutineTable[name].index;
    } else if (this.classTable[name] && typeof this.classTable[name].index === 'number') {
      return this.classTable[name].index;
    }
  }

  isNested(name) {
    if (this.subScopes.length > 0) {
      let nesting = [false, null];
      for (let s = this.subScopes.length - 1; s >= 0; s--) {
        if (this.subScopes[s][name]) {
          nesting = [true, s];
          break;
        }
      }
      return nesting;
    } else {
      return [false, null];
    }
  } 

  exists(name) {
    let subscope = false;
    this.subScopes.forEach(scope => {
      subscope = subscope || name in scope;
    });
    return subscope || name in this.subroutineTable || name in this.classTable;
  }
}

module.exports = {
  SymbolTableKinds,
  SymbolTable,
};
