import { useState, useCallback } from 'react';
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1';
import { sha256 } from 'js-sha256';
import { Actor, HttpAgent } from '@dfinity/agent';
import { ethTransferIdl, solTransferIdl, matchingEngineIdl } from '../idl';
import config from '../config.json';

/**
 * Custom hook for managing identity derivation and canister actors.
 * @param {Function} checkBalances - Function to refresh balances after derivation.
 * @param {Function} setIntentDestAddress - Function to auto-fill destination address.
 * @returns {{ identity, derivedInfo, ethActor, solActor, matchingActor, handleSeedDerivation, loading }}
 */
export function useIdentity(checkBalances, setIntentDestAddress) {
    const [inputValue, setInputValue] = useState('Alice');
    const [loading, setLoading] = useState(false);
    const [identity, setIdentity] = useState(null);
    const [derivedInfo, setDerivedInfo] = useState(null);
    const [ethActor, setEthActor] = useState(null);
    const [solActor, setSolActor] = useState(null);
    const [matchingActor, setMatchingActor] = useState(null);

    const handleSeedDerivation = useCallback(async () => {
        if (!inputValue) return;
        try {
            setLoading(true);

            const seedBytes = new Uint8Array(sha256.array(inputValue));
            const icpId = Secp256k1KeyIdentity.fromSecretKey(seedBytes);
            const principal = icpId.getPrincipal();
            const principalText = principal.toText();

            const agent = new HttpAgent({ identity: icpId, host: "https://ic0.app" });
            const ethCanisterId = config.chains['sepolia'].canisterId;
            const solCanisterId = config.chains['solana-devnet'].canisterId;
            const matchingCanisterId = config.matchingEngine;

            const ethActorInstance = Actor.createActor(ethTransferIdl, { agent, canisterId: ethCanisterId });
            const solActorInstance = Actor.createActor(solTransferIdl, { agent, canisterId: solCanisterId });
            const matchingActorInstance = Actor.createActor(matchingEngineIdl, { agent, canisterId: matchingCanisterId });

            setIdentity(icpId);
            setEthActor(ethActorInstance);
            setSolActor(solActorInstance);
            setMatchingActor(matchingActorInstance);

            // Check cache
            const cacheKey = `address_cache_${inputValue}`;
            const cached = localStorage.getItem(cacheKey);
            let ethAddress, solAddress;

            if (cached) {
                const data = JSON.parse(cached);
                ethAddress = data.ethAddress;
                solAddress = data.solAddress;
                console.log("Using cached addresses for", inputValue);
            } else {
                const [ethRes, solRes] = await Promise.all([
                    ethActorInstance.get_eth_address(principal),
                    solActorInstance.get_sol_address(principal)
                ]);

                if (ethRes && 'Ok' in ethRes && solRes && 'Ok' in solRes) {
                    ethAddress = ethRes.Ok;
                    solAddress = solRes.Ok;
                    localStorage.setItem(cacheKey, JSON.stringify({ ethAddress, solAddress }));
                } else {
                    console.error("Failed to fetch addresses:", { ethRes, solRes });
                    setLoading(false);
                    return;
                }
            }

            setDerivedInfo({ principal: principalText, ethAddress, solAddress, seed: inputValue });

            // Auto-fill intent destination with Solana address (default dest is Solana)
            if (setIntentDestAddress) {
                setIntentDestAddress(solAddress);
            }

            // Trigger balance check
            if (checkBalances) {
                checkBalances([ethAddress, solAddress]);
            }

        } catch (e) {
            console.error("Derivation error:", e);
        } finally {
            setLoading(false);
        }
    }, [inputValue, checkBalances, setIntentDestAddress]);

    const handleInputChange = useCallback((newValue) => {
        setInputValue(newValue);
        setDerivedInfo(null);
        setIdentity(null);
    }, []);

    return {
        inputValue,
        setInputValue: handleInputChange,
        identity,
        derivedInfo,
        ethActor,
        solActor,
        matchingActor,
        handleSeedDerivation,
        loading
    };
}
