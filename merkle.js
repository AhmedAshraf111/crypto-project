"use strict";

const utils = require('./utils.js');

class MerkleTree {
  static calculateSize(numElems) {
    let n = 1;
    while (n < numElems) {  
      n *= 2;     
    }
    return (n * 2) - 1;
  }

  static hashToRoot(hashes, i) {
    if (i === 0) return;
    let par = Math.floor((i-2)/2);
    hashes[par] = utils.hash("" + hashes[i-1] + "," + hashes[i]);
    if (par%2 === 0) {
      this.hashToRoot(hashes, par);
    }
  }

  constructor(transactions) {
    this.transactions = [];
    this.hashes = [];
    this.lookup = {};
    let numBalancedTree = this.constructor.calculateSize(transactions.length);
    let firstTrans = Math.floor(numBalancedTree / 2);

   for (let i=firstTrans; i<numBalancedTree; i++) {
  let tNum = i - firstTrans;
  let v = tNum < transactions.length ? transactions[tNum].toString() : "";
  let h = utils.hash(v);
  this.transactions[tNum] = v;
  this.hashes[i] = h;
  this.lookup[h] = i;
}

    for (let i=firstTrans+1; i<this.hashes.length; i+=2) {
      this.constructor.hashToRoot(this.hashes, i);
    }
  }

  get root() {
    return this.hashes[0];
  }

  getPath(transaction) {
    let h = utils.hash(transaction);
    let i = this.lookup[h];
    let path = { txInd: i, hashes: [] };

    if (i === undefined) {
      throw new Error("Transaction not found in Merkle tree");
    }

    while (i !== 0) {
      let siblingIndex = i % 2 === 0 ? i - 1 : i + 1;
      path.hashes.push({
        index: siblingIndex,
        hash: this.hashes[siblingIndex]
      });
      i = Math.floor((i - 1) / 2);
    }

    return path;
  }

  verify(tx, path) {
    let i = path.txInd;
    let h = utils.hash(tx);
    let currentHash = h;

    for (let sibling of path.hashes) {
      let siblingHash = sibling.hash;
      let siblingIndex = sibling.index;
      if (i % 2 === 1) {
        currentHash = utils.hash(siblingHash + "," + currentHash);
      } else {
        currentHash = utils.hash(currentHash + "," + siblingHash);
      }
      i = Math.floor((i - 1) / 2);
    }

    return currentHash === this.hashes[0];
  }

  contains(t) {
    let h = utils.hash(t);
    return this.lookup[h] !== undefined;
  }

  display() {
    let i = 0;
    let nextRow = 0;
    let s = "";
    console.log();
    while (i < this.hashes.length) {
      s += this.hashes[i].slice(0,6) + " ";
      if (i === nextRow) {
        console.log(s);
        s = "";
        nextRow = (nextRow+1) * 2;
      }
      i++;
    }
  }
}

exports.MerkleTree = MerkleTree;