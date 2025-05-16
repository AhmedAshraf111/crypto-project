const { MerkleTree } = require('./merkle.js');
const { hash, sign, verifySignature, getTime } = require('./utils.js');
const { Prover } = require('./prover.js');

class Transaction {
  constructor({ sender, recipient, amount, signature, timestamp }) {
    this.sender = sender;
    this.recipient = recipient;
    this.amount = amount;
    this.signature = signature;
    this.timestamp = timestamp || getTime();
    this.id = hash(`${sender}${recipient}${amount}${this.timestamp}`);
  }

  verifySignature() {
    const data = `${this.sender}${this.recipient}${this.amount}${this.timestamp}`;
    return verifySignature(data, this.signature, this.sender);
  }
}

class Block {
  constructor(transactions, previousHash, rewardAddr) {
    this.previousHash = previousHash;
    this.transactions = transactions;
    this.merkleTree = new MerkleTree(transactions.map(tx => tx.id));
    this.timestamp = getTime();
    this.nonce = 0;
    this.hash = this.calculateHash();
    this.rewardAddr = rewardAddr;
    this.prover = new Prover(20); // Adjust numLeadingZeroes as needed
  }

  calculateHash() {
    return hash(`${this.previousHash}${this.merkleTree.root}${this.nonce}${this.timestamp}`);
  }

  mineBlock() {
    this.nonce = this.prover.findProof(this.calculateHash());
    this.hash = this.calculateHash();
  }
}

class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.balances = new Map();
    this.balances.set('genesis', 1000); // Initial balance for testing
  }

  createGenesisBlock() {
    return new Block([], '0', null);
  }

  addBlock(block) {
    if (block.previousHash === this.chain[this.chain.length - 1].hash) {
      this.chain.push(block);
      this.updateBalances(block);
    }
  }

  mineBlock(transactions, rewardAddr) {
    const block = new Block(transactions, this.chain[this.chain.length - 1].hash, rewardAddr);
    block.mineBlock();
    this.addBlock(block);
    return block;
  }

  getBalance(address) {
    return this.balances.get(address) || 0;
  }

  updateBalances(block) {
    block.transactions.forEach(tx => {
      this.balances.set(tx.sender, (this.balances.get(tx.sender) || 0) - tx.amount);
      this.balances.set(tx.recipient, (this.balances.get(tx.recipient) || 0) + tx.amount);
    });
    if (block.rewardAddr) {
      this.balances.set(block.rewardAddr, (this.balances.get(block.rewardAddr) || 0) + 10); // Mining reward
    }
  }
}

module.exports = { Blockchain, Block, Transaction };