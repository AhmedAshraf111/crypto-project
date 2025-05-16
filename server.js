const express = require("express");
const net = require("net");
const cors = require("cors");
const { ec } = require("elliptic");
const { sha256 } = require("js-sha256");
const fetch = require("node-fetch"); // إضافة مكتبة node-fetch للتواصل بين النودز

const curve = new ec("secp256k1");
const app = express();
app.use(express.json());
app.use(cors());

// قايمة النودز المتاحة
const nodes = [
  { hostname: "localhost", port: 3000 }, // Minnie
  { hostname: "localhost", port: 3002 }, // Mickey
];

// Blockchain data
let blockchain = {
  balances: {
    "04a8e06ab7ca8a5ef4181fa062f39c73f8629f6a6e8da0fc0786ab08320d5f54e42d3b134b857f32c815c43ffc5c45a917083c77f3f8f00f11981c2b5db906c85d": 100, // Minnie
    "0460258b7e2c580fbb5fa71e9b74533aef66bd7e92e15bbf921c32ebdfeb196ba665e92f814a40f03fcd71da0e886b43ffac283641c63f693f5e3b8cdc5fa59a38": 50, // Mickey
  },
  transactions: [],
};

// Express Server
const startExpressServer = (port) => {
  app.get("/balances", (req, res) => {
    console.log(`[Port ${port}] Returning balances:`, blockchain.balances);
    res.json(blockchain.balances);
  });

  app.post("/transaction", async (req, res) => {
    try {
      const { from, to, amount, fee, signature } = req.body;

      // Log the entire request
      console.log(`[Port ${port}] Received transaction:`, { from, to, amount, fee });

      // Validate input
      if (!from || !to || !amount || !fee || !signature) {
        console.error(`[Port ${port}] Missing required fields:`, { from, to, amount, fee, signature });
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate amount and fee
      if (amount <= 0 || fee <= 0) {
        console.error(`[Port ${port}] Invalid amount or fee: amount=${amount}, fee=${fee}`);
        return res.status(400).json({ error: "Amount and fee must be positive" });
      }

      // Verify signature
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

      // Process transaction
      console.log(`[Port ${port}] Current balances before transaction:`, blockchain.balances);
      if (blockchain.balances[from] >= amount + fee) {
        // Deduct from sender
        blockchain.balances[from] -= amount + fee;
        console.log(`[Port ${port}] After deducting ${amount + fee} from ${from}:`, blockchain.balances);

        // Add to recipient
        if (blockchain.balances.hasOwnProperty(to)) {
          blockchain.balances[to] += amount;
          console.log(`[Port ${port}] After adding ${amount} to ${to}:`, blockchain.balances);
        } else {
          console.error(`[Port ${port}] Recipient 'to' key not found: ${to}`);
          blockchain.balances[from] += amount + fee; // Rollback
          return res.status(400).json({ error: "Recipient public key not found" });
        }

        // Record transaction
        blockchain.transactions.push({ from, to, amount, fee });
        console.log(`[Port ${port}] Transaction recorded:`, { from, to, amount, fee });

        // Sync with other nodes
        for (const node of nodes) {
          if (node.port !== port) { // Skip the current node
            try {
              const nodeUrl = `http://${node.hostname}:${node.port}/transaction`;
              console.log(`[Port ${port}] Syncing transaction to ${nodeUrl}`);
              await fetch(nodeUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from, to, amount, fee, signature }),
              });
              console.log(`[Port ${port}] Successfully synced transaction to ${nodeUrl}`);
            } catch (error) {
              console.error(`[Port ${port}] Failed to sync transaction to ${nodeUrl}:`, error.message);
            }
          }
        }

        res.json({ success: true });
      } else {
        console.error(`[Port ${port}] Insufficient balance for ${from}: balance=${blockchain.balances[from]}, required=${amount + fee}`);
        return res.status(400).json({ error: "Insufficient balance" });
      }
    } catch (error) {
      console.error(`[Port ${port}] Error processing transaction:`, error.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.listen(port, () => {
    console.log(`Express server running on port ${port}`);
  });
};

// TCP Server
const startTCPServer = (port) => {
  const server = net.createServer((socket) => {
    socket.write("Connected to TCP server");
    socket.on("data", (data) => {
      console.log(`[Port ${port}] Received TCP data: ${data}`);
      socket.write(`Echo: ${data}`);
    });
    socket.on("end", () => {
      console.log(`[Port ${port}] Client disconnected`);
    });
  });

  server.listen(port, () => {
    console.log(`TCP server running on port ${port}`);
  });
};

// Initialize Blockchain
const initializeBlockchain = () => {
  console.log("Blockchain initialized successfully");
};

// Start Servers
const startServer = (expressPort, tcpPort) => {
  console.log("Starting server...");
  initializeBlockchain();
  console.log(`Running Express server on port: ${expressPort}`);
  console.log(`Running TCP server on port: ${tcpPort}`);
  console.log(`Attempting to start TCP server on port ${tcpPort}`);
  startExpressServer(expressPort);
  startTCPServer(tcpPort);
};

// Get port from command line argument
const expressPort = parseInt(process.argv[2]) || 3000;
const tcpPort = expressPort + 1;
startServer(expressPort, tcpPort);