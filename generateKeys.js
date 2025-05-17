const { ec } = require("elliptic");
const curve = new ec("secp256k1");
const keyPair = curve.genKeyPair();
console.log("Public Key:", keyPair.getPublic("hex"));
console.log("Private Key:", keyPair.getPrivate("hex"));