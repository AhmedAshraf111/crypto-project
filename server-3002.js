const express = require("express");
const cors = require("cors");
const { ec } = require("elliptic");
const { sha256 } = require("js-sha256");
const fetch = require("node-fetch");
const fs = require("fs");

const curve = new ec("secp256k1");
const app = express();
app.use(express.json());
app.use(cors());

const nodes = [
  { hostname: "localhost", port: 3000 }, // Minnie
  { hostname: "localhost", port: 3002 }, // Mickey
];

const port = parseInt(process.argv[2]) || 3002;
const BLOCKCHAIN_FILE = `blockchain-${port}.json`;
const DIFFICULTY = 4;

let blockchain = loadBlockchain();
let pendingTransactions = [];

// Loads the blockchain data from a JSON file or initializes a new one with default balances if the file doesn't exist.
function loadBlockchain() {
  try {
    if (fs.existsSync(BLOCKCHAIN_FILE)) {
      const data = fs.readFileSync(BLOCKCHAIN_FILE);
      const loaded = JSON.parse(data);
      return {
        balances: loaded.balances || {},
        blocks: loaded.blocks || []
      };
    }
    return {
      balances: {
        "04a8e06ab7ca8a5ef4181fa062f39c73f8629f6a6e8da0fc0786ab08320d5f54e42d3b134b857f32c815c43ffc5c45a917083c77f3f8f00f11981c2b5db906c85d": 100, // Minnie
        "0460258b7e2c580fbb5fa71e9b74533aef66bd7e92e15bbf921c32ebdfeb196ba665e92f814a40f03fcd71da0e886b43ffac283641c63f693f5e3b8cdc5fa59a38": 50 // Mickey
      },
      blocks: []
    };
  } catch (error) {
    console.error(`[Port ${port}] Error loading blockchain:`, error.message);
    return { balances: {}, blocks: [] };
  }
}

// Saves the current blockchain data (balances and blocks) to a JSON file.
function saveBlockchain() {
  fs.writeFileSync(BLOCKCHAIN_FILE, JSON.stringify(blockchain, null, 2));
}

// Endpoint to get the current balances of all nodes.
app.get("/balances", (req, res) => {
  console.log(`[Port ${port}] Returning balances:`, blockchain.balances);
  res.json(blockchain.balances);
});

// Endpoint to register a new node (client or miner) by adding its public key and initial balance.
app.post("/register", async (req, res) => {
  try {
    const { publicKey } = req.body;
    console.log(`[Port ${port}] Registering new node:`, publicKey.substring(0, 10) + "...");

    if (!publicKey) {
      console.error(`[Port ${port}] Missing public key`);
      return res.status(400).json({ error: "Missing public key" });
    }

    if (!blockchain.balances.hasOwnProperty(publicKey)) {
      blockchain.balances[publicKey] = 100;
      saveBlockchain();
      console.log(`[Port ${port}] Added new node with balance 100:`, publicKey.substring(0, 10) + "...");
    }

    for (const node of nodes) {
      if (node.port !== port) {
        try {
          await fetch(`http://${node.hostname}:${node.port}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockchain, pendingTransactions })
          });
        } catch (error) {
          console.error(`[Port ${port}] Failed to sync with node ${node.port}:`, error.message);
        }
      }
    }

    res.json({ success: true, message: "Node registered successfully" });
  } catch (error) {
    console.error(`[Port ${port}] Error registering node:`, error.message);
    res.status(500).json({ error: "Failed to register node" });
  }
});

// Endpoint to receive a new transaction, validate it, and add it to the pending transactions list.
app.post("/transaction", async (req, res) => {
  try {
    const { from, to, amount, fee, signature } = req.body;

    console.log(`[Port ${port}] Received transaction:`, { from, to, amount, fee });

    if (!from || !to || !amount || !fee || !signature) {
      console.error(`[Port ${port}] Missing required fields:`, { from, to, amount, fee, signature });
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (amount <= 0 || fee <= 0) {
      console.error(`[Port ${port}] Invalid amount or fee: amount=${amount}, fee=${fee}`);
      return res.status(400).json({ error: "Amount and fee must be positive" });
    }

    const hash = sha256(`${from}${to}${amount}${fee}`);
    console.log(`[Port ${port}] Transaction hash: ${hash}`);
    let key;
    try {
      key = curve.keyFromPublic(from, "hex");
    } catch (e) {
      console.error(`[Port ${port}] Invalid public key for 'from':`, e.message);
      return res.status(400).json({ error: "Invalid public key" });
    }
    let isValid;
    try {
      isValid = key.verify(hash, signature);
    } catch (e) {
      console.error(`[Port ${port}] Signature verification failed:`, e.message);
      return res.status(400).json({ error: "Invalid signature" });
    }

    if (!isValid) {
      console.error(`[Port ${port}] Invalid signature`);
      return res.status(400).json({ error: "Invalid signature" });
    }

    if (!blockchain.balances.hasOwnProperty(from) || !blockchain.balances.hasOwnProperty(to)) {
      console.error(`[Port ${port}] Invalid sender or recipient`);
      return res.status(400).json({ error: "Invalid sender or recipient" });
    }

    if (blockchain.balances[from] < amount + fee) {
      console.error(`[Port ${port}] Insufficient balance for ${from}`);
      return res.status(400).json({ error: "Insufficient balance" });
    }

    pendingTransactions.push({ from, to, amount, fee, signature });
    saveBlockchain();
    console.log(`[Port ${port}] Transaction recorded in pending:`, { from, to, amount, fee });

    for (const node of nodes) {
      if (node.port !== port) {
        try {
          await fetch(`http://${node.hostname}:${node.port}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockchain, pendingTransactions })
          });
        } catch (error) {
          console.error(`[Port ${port}] Failed to sync with node ${node.port}:`, error.message);
        }
      }
    }

    res.json({ success: true, message: "Transaction recorded in pending transactions" });
  } catch (error) {
    console.error(`[Port ${port}] Error processing transaction:`, error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to process a mined block, validate it, update balances, and add it to the blockchain.
app.post("/mine", async (req, res) => {
  try {
    const { minerPublicKey, transactions, nonce, hash, timestamp } = req.body;
    console.log(`[Port ${port}] Received mined block:`, { miner: minerPublicKey.substring(0, 10) + "...", nonce, hash, timestamp });

    const blockData = JSON.stringify({ transactions, nonce, timestamp });
    console.log(`[Port ${port}] blockData:`, blockData);
    const calculatedHash = sha256(blockData);
    console.log(`[Port ${port}] Calculated hash: ${calculatedHash}`);
    if (calculatedHash !== hash || !hash.startsWith("0".repeat(DIFFICULTY))) {
      console.error(`[Port ${port}] Invalid proof-of-work`, { expectedHash: hash, calculatedHash });
      return res.status(400).json({ error: "Invalid proof-of-work" });
    }

    for (const tx of transactions) {
      if (!tx.signature) {
        console.error(`[Port ${port}] Transaction missing signature:`, tx);
        return res.status(400).json({ error: "Transaction missing signature" });
      }
      const txHash = sha256(`${tx.from}${tx.to}${tx.amount}${tx.fee}`);
      let key;
      try {
        key = curve.keyFromPublic(tx.from, "hex");
      } catch (e) {
        console.error(`[Port ${port}] Invalid public key in transaction`);
        return res.status(400).json({ error: "Invalid public key in transaction" });
      }
      if (!key.verify(txHash, tx.signature)) {
        console.error(`[Port ${port}] Invalid signature in transaction`);
        return res.status(400).json({ error: "Invalid signature in transaction" });
      }
      if (!blockchain.balances.hasOwnProperty(tx.from) || !blockchain.balances.hasOwnProperty(tx.to)) {
        console.error(`[Port ${port}] Invalid sender or recipient`);
        return res.status(400).json({ error: "Invalid sender or recipient" });
      }
      if (blockchain.balances[tx.from] < tx.amount + tx.fee) {
        console.error(`[Port ${port}] Insufficient balance for transaction`);
        return res.status(400).json({ error: "Insufficient balance" });
      }
    }

    const block = { transactions, nonce, timestamp, hash };
    if (!blockchain.blocks) blockchain.blocks = [];
    blockchain.blocks.push(block);

    for (const tx of transactions) {
      blockchain.balances[tx.from] -= tx.amount + tx.fee;
      blockchain.balances[tx.to] += tx.amount;
      const index = pendingTransactions.findIndex(t => 
        t.from === tx.from && 
        t.to === tx.to && 
        t.amount === tx.amount && 
        t.fee === tx.fee && 
        t.signature === tx.signature
      );
      if (index !== -1) pendingTransactions.splice(index, 1);
    }

    if (!blockchain.balances.hasOwnProperty(minerPublicKey)) {
      blockchain.balances[minerPublicKey] = 0;
    }
    blockchain.balances[minerPublicKey] += 10;
    console.log(`[Port ${port}] Miner reward: ${minerPublicKey.substring(0, 10) + "..."} balance=${blockchain.balances[minerPublicKey]}`);

    saveBlockchain();
    for (const node of nodes) {
      if (node.port !== port) {
        try {
          await fetch(`http://${node.hostname}:${node.port}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockchain, pendingTransactions })
          });
        } catch (error) {
          console.error(`[Port ${port}] Failed to sync with node ${node.port}:`, error.message);
        }
      }
    }

    res.json({ success: true, message: "Block mined successfully" });
  } catch (error) {
    console.error(`[Port ${port}] Error processing mined block:`, error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to sync the local blockchain and pending transactions with data received from another node.
app.post("/sync", (req, res) => {
  try {
    const { blockchain: newBlockchain, pendingTransactions: newPending } = req.body;
    console.log(`[Port ${port}] Syncing blockchain:`, newBlockchain);
    blockchain = newBlockchain;
    pendingTransactions = newPending;
    saveBlockchain();
    res.json({ success: true, message: "Blockchain synced" });
  } catch (error) {
    console.error(`[Port ${port}] Error syncing blockchain:`, error.message);
    res.status(500).json({ error: "Failed to sync blockchain" });
  }
});

// Endpoint to get the list of pending transactions.
app.get("/transactions", (req, res) => {
  try {
    console.log(`[Port ${port}] Returning transactions:`, pendingTransactions);
    res.json(pendingTransactions);
  } catch (error) {
    console.error(`[Port ${port}] Error fetching transactions:`, error.message);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Starts the Express server on the specified port.
app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});