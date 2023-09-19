const fs = require('fs');
const assert = require('assert');
const {Enum} = require('./Enum');

const Segments = new Enum({
  CONST: {value: 0, description: 'constant'},
  ARG: {value: 1, description: 'argument'},
  LOCAL: {value: 2, description: 'local'},
  STATIC: {value: 3, description: 'static'},
  THIS: {value: 4, description: 'this'},
  THAT: {value: 5, description: 'that'},
  POINTER: {value: 6, description: 'pointer'},
  TEMP: {value: 7, description: 'temp'},
  THATB: {value: 8, description: 'thatb'},
});

const Commands = new Enum({
  ADD: {value:0, description: 'add'},
  SUB: {value:1, description: 'sub'},
  NEG: {value:2, description: 'neg'},
  EQ: {value:3, description: 'eq'},
  GT: {value:4, description: 'gt'},
  LT: {value:5, description: 'lt'},
  AND: {value:6, description: 'and'},
  OR: {value:7, description: 'or'},
  NOT: {value:8, description: 'not'},
});

class VMWriter {
  constructor(outputFilename) {
    this.outputFile = fs.openSync(outputFilename + '.vm', 'w+');
  }

  write(str) {
    fs.appendFileSync(this.outputFile, str + '\n');
  }

  writePushRef(type, segment, index) {
    assert(Segments.contains(segment), `Segment is not valid.`);
    assert(Number.isInteger(index), 'index must be an integer');
    this.write(`#pushref ${type} ${segment.display} ${index}`);
  }

  writePush(segment, index) {
    assert(Segments.contains(segment), `Segment is not valid.`);
    assert(Number.isInteger(index), 'index must be an integer');
    if (Segments.CONST !== segment) {
      assert( index >= 0, 'index must be >= 0');
    }

    this.write(`push ${segment.display} ${index}`);
  }

  writePop(segment, index) {
    assert(Segments.contains(segment), `Segment is not valid.`);
    assert(Number.isInteger(index) && index >= 0, 'index must be an integer >= 0');
    assert.notEqual(segment, Segments.CONST, 'Cannot pop constant');

    this.write(`pop ${segment.display} ${index}`);
  }

  writeArithmetic(command) {
    assert(Commands.contains(command), 'Command must be a Commands.ADD, Commands.SUB, etc');

    this.write(command.display);
  }

  writeLabel(label) {
    this.write(`label ${label}`);
  }

  writePushLabel(label) {
    this.write(`#pushlabel ${label}`);
  }

  writePopCommon(temp) {
    this.write(`#popcommon ${temp}`);
  }

  writePushCommon() {
    this.write(`#pushcommon`);
  }

  writeGoto(label) {
    this.write(`goto ${label}`);
  }

  writeIf(label) {
    this.write(`if-goto ${label}`);
  }

  writeCall(name, nArgs) {
    assert(Number.isInteger(nArgs) && nArgs >= 0, 'nArgs must be an integer >= 0');

    this.write(`call ${name} ${nArgs}`);
  }

  writeCallIndirect(nArgs) {
    assert(Number.isInteger(nArgs) && nArgs >= 0, 'nArgs must be an integer >= 0');
    this.write(`#calltos ${nArgs}`);
  }

  writeFunction(name, nLocals) {
    assert(Number.isInteger(nLocals) && nLocals >= 0, 'nLocals must be an integer >= 0');

    this.write(`function ${name} ${nLocals}`);
  }

  writeReturn() {
    this.write('return');
  }

  writeConstString(lab, str) {
    this.write(`#cstring ${lab} "${str}"`);
  }

  writeStaticArray(id, size, array) {
    this.write(`#array ${id} ${size} ${array}`);
  }

  resStaticArray(id, size) {
    this.write(`#res ${id} ${size}`)
  }

  close() {
    fs.closeSync(this.outputFile);
    this.outputFile = null;
  }
}

module.exports = {
  Segments,
  Commands,
  VMWriter,
};
