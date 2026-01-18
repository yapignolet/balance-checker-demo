import * as secp256k1 from '@noble/secp256k1';

// Chain and asset IDs for intent serialization (must match Rust)
const CHAIN_IDS = { ethereum: 1, solana: 2 };
const ASSET_IDS = { USDC: 1, EURC: 2 };

/**
 * Serialize intent for signing - must match Rust serialize_intent_for_signing.
 * @param {Principal} principal - User's ICP principal.
 * @param {string} sourceChain - Source chain ('ethereum' or 'solana').
 * @param {string} sourceSymbol - Source asset symbol.
 * @param {string} destChain - Destination chain.
 * @param {string} destSymbol - Destination asset symbol.
 * @param {string} amount - Amount in base units.
 * @param {string} minOutput - Minimum output in base units.
 * @param {string} sequenceNumber - Sequence number.
 * @param {string} destAddress - Destination address.
 * @returns {Uint8Array} - Serialized bytes for signing.
 */
export function serializeIntentForSigning(
    principal, sourceChain, sourceSymbol, destChain, destSymbol,
    amount, minOutput, sequenceNumber, destAddress
) {
    const parts = [];

    // Principal bytes
    const principalBytes = principal.toUint8Array();
    parts.push(...principalBytes);

    // Chain and asset IDs (1 byte each)
    parts.push(CHAIN_IDS[sourceChain]);
    parts.push(ASSET_IDS[sourceSymbol]);
    parts.push(CHAIN_IDS[destChain]);
    parts.push(ASSET_IDS[destSymbol]);

    // amount (8 bytes, big endian)
    const amountBuf = new ArrayBuffer(8);
    new DataView(amountBuf).setBigUint64(0, BigInt(amount), false);
    parts.push(...new Uint8Array(amountBuf));

    // min_output (8 bytes, big endian)
    const minOutputBuf = new ArrayBuffer(8);
    new DataView(minOutputBuf).setBigUint64(0, BigInt(minOutput), false);
    parts.push(...new Uint8Array(minOutputBuf));

    // sequence_number (8 bytes, big endian)
    const seqBuf = new ArrayBuffer(8);
    new DataView(seqBuf).setBigUint64(0, BigInt(sequenceNumber), false);
    parts.push(...new Uint8Array(seqBuf));

    // dest_address (string bytes)
    const encoder = new TextEncoder();
    parts.push(...encoder.encode(destAddress));

    return new Uint8Array(parts);
}

/**
 * Encode public key in DER/SPKI format for Secp256k1.
 * @param {Uint8Array} privateKey - 32-byte private key.
 * @returns {Uint8Array} - DER-encoded public key.
 */
export function encodeSecp256k1PublicKeyDer(privateKey) {
    // SPKI header for secp256k1 (OID 1.2.840.10045.2.1 + 1.3.132.0.10)
    const spkiHeader = new Uint8Array([
        0x30, 0x56, // SEQUENCE, 86 bytes
        0x30, 0x10, // SEQUENCE, 16 bytes (AlgorithmIdentifier)
        0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
        0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, // OID secp256k1
        0x03, 0x42, 0x00 // BIT STRING, 66 bytes, 0 unused bits
    ]);

    // Get uncompressed public key (65 bytes starting with 0x04)
    const uncompressedPubKey = secp256k1.getPublicKey(privateKey, false);

    const der = new Uint8Array(spkiHeader.length + uncompressedPubKey.length);
    der.set(spkiHeader);
    der.set(uncompressedPubKey, spkiHeader.length);
    return der;
}

// Re-export secp256k1 for signing operations
export { secp256k1 };
