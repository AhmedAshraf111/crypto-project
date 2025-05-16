const { ec } = require("elliptic");
const { sha256 } = require("js-sha256");

const curve = new ec("secp256k1");

// Load node configurations
let minnie, mickey;
try {
  minnie = require("./minnie.json");
  mickey = require("./t");
  console.log("Nodes loaded:", { minnie, mickey });
} catch (error) {
  console.error("Error loading node configs:", error);
}

// DOM Elements
const nodeSelect = document.getElementById("node-select");
const balanceDisplay = document.getElementById("balance-display");
const toInput = document.getElementById("to");
const amountInput = document.getElementById("amount");
const feeInput = document.getElementById("fee");
const sendButton = document.getElementById("send-button");
const checkBalanceButton = document.getElementById("check-balance-button");

// Check if DOM elements exist
if (!nodeSelect || !balanceDisplay || !checkBalanceButton) {
  console.error("DOM elements not found:", {
    nodeSelect: !!nodeSelect,
    balanceDisplay: !!balanceDisplay,
    checkBalanceButton: !!checkBalanceButton,
  });
}

// Initialize node selection
if (nodeSelect) {
  nodeSelect.innerHTML = `
    <option value="minnie">Minnie (localhost:3000)</option>
    <option value="mickey">Mickey (localhost:3002)</option>
  `;
  console.log("Dropdown initialized");
} else {
  console.error("node-select element not found");
}

let selectedNode = minnie;

// Event Listeners
if (nodeSelect) {
  nodeSelect.addEventListener("change", (e) => {
    selectedNode = e.target.value === "minnie" ? minnie : mickey;
    console.log("Selected node:", selectedNode);
    updateBalance();
  });
}

if (checkBalanceButton) {
  checkBalanceButton.addEventListener("click", updateBalance);
}

if (sendButton) {
  sendButton.addEventListener("click", async () => {
    const to = toInput.value;
    const amount = parseInt(amountInput.value);
    const fee = parseInt(feeInput.value);

    if (!to || isNaN(amount) || isNaN(fee)) {
      alert("Please fill all fields correctly");
      return;
    }

    try {
      const nodeUrl = `http://${selectedNode.connection.hostname}:${selectedNode.connection.port}`;
      const publicKey = selectedNode.keyPair.public;
      const privateKey = selectedNode.keyPair.private;

      // Create and sign transaction
      const hash = sha256(`${publicKey}${to}${amount}${fee}`);
      const keyPair = curve.keyFromPrivate(privateKey, "hex");
      const signature = keyPair.sign(hash, "hex");

      // Send transaction
      const response = await fetch(`${nodeUrl}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: publicKey,
          to,
          amount,
          fee,
          signature,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert("Transaction sent successfully!");
        updateBalance();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error sending transaction:", error);
      alert("Failed to send transaction");
    }
  });
}

// Update balance display
async function updateBalance() {
  try {
    const nodeUrl = `http://${selectedNode.connection.hostname}:${selectedNode.connection.port}`;
    const publicKey = selectedNode.keyPair.public;

    const response = await fetch(`${nodeUrl}/balances`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const balances = await response.json();
    const balance = balances[publicKey] || 0;
    balanceDisplay.textContent = `Balance: ${balance}`;
  } catch (error) {
    console.error("Error fetching balances:", error);
    balanceDisplay.textContent = "Error fetching balance";
  }
}

// Initial balance update
updateBalance();