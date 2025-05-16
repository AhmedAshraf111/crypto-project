"use strict";

const utils = require('./utils.js');

class Prover {
  constructor(numLeadingZeroes) {
    this.numLeadingZeroes = numLeadingZeroes;
  }

  verifyProof(s, proof) {
    const hash = utils.hash(s + proof);
    const requiredZeroes = Math.ceil(this.numLeadingZeroes / 4);
    for (let i = 0; i < requiredZeroes; i++) {
      if (hash[i] !== '0') {
        return false;
      }
    }
    return true;
  }

  findProof(s) {
    let proof = 0;
    while (!this.verifyProof(s, proof.toString())) {
      proof++;
    }
    return proof.toString();
  }
}

exports.Prover = Prover;