// Asset symbol for token transfers
const AssetSymbol = (IDL) => IDL.Variant({ 'USDC': IDL.Null, 'EURC': IDL.Null });

// CHError enum matching the canister's error type
const CHError = (IDL) => IDL.Variant({
    'Unauthorized': IDL.Text,
    'InsufficientBalance': IDL.Record({
        'asset': AssetSymbol(IDL),
        'requested': IDL.Nat64,
        'available': IDL.Nat64
    }),
    'ParsingError': IDL.Text,
    'ArithmeticError': IDL.Text,
    'TransferFailed': IDL.Text,
    'OrderNotFound': IDL.Nat64,
    'MatchingError': IDL.Text,
    'InvalidIntent': IDL.Text,
    'EcdsaError': IDL.Text,
    'StorageError': IDL.Text,
    'Unknown': IDL.Text
});

const IntentDef = (IDL) => {
    const Chain = IDL.Variant({ 'Ethereum': IDL.Null, 'Solana': IDL.Null });
    const Symbol = IDL.Variant({ 'USDC': IDL.Null, 'EURC': IDL.Null });
    const Asset = IDL.Record({ 'chain': Chain, 'symbol': Symbol });
    const SignatureType = IDL.Variant({ 'Secp256k1': IDL.Null, 'Ed25519': IDL.Null });
    return IDL.Record({
        'user': IDL.Principal,
        'source_asset': Asset,
        'dest_asset': Asset,
        'dest_address': IDL.Text,
        'amount': IDL.Nat64,
        'min_output': IDL.Nat64,
        'sequence_number': IDL.Nat64,
        'public_key': IDL.Vec(IDL.Nat8),
        'signature': IDL.Vec(IDL.Nat8),
        'signature_type': SignatureType
    });
};

export const ethTransferIdl = ({ IDL }) => {
    const Symbol = AssetSymbol(IDL);
    const Error = CHError(IDL);
    const Intent = IntentDef(IDL);
    return IDL.Service({
        'get_eth_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })], []),
        'get_balances': IDL.Func([IDL.Principal], [IDL.Variant({
            'Ok': IDL.Record({ 'eth': IDL.Text, 'usdc': IDL.Text, 'eurc': IDL.Text }),
            'Err': Error
        })], []),
        'get_address_for_intent': IDL.Func([Intent], [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })], []),
        'transfer_native': IDL.Func(
            [IDL.Principal, IDL.Text, IDL.Text],
            [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })],
            []
        ),
        'transfer': IDL.Func(
            [Symbol, IDL.Principal, IDL.Text, IDL.Text],
            [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })],
            []
        ),
    });
};

export const solTransferIdl = ({ IDL }) => {
    const Symbol = AssetSymbol(IDL);
    const Error = CHError(IDL);
    const Intent = IntentDef(IDL);
    return IDL.Service({
        'get_sol_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })], []),
        'get_balances': IDL.Func([IDL.Principal], [IDL.Variant({
            'Ok': IDL.Record({ 'sol': IDL.Text, 'eurc': IDL.Text, 'usdc': IDL.Text }),
            'Err': Error
        })], []),
        'get_address_for_intent': IDL.Func([Intent], [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })], []),
        'transfer_native': IDL.Func(
            [IDL.Principal, IDL.Text, IDL.Text],
            [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })],
            []
        ),
        'transfer': IDL.Func(
            [Symbol, IDL.Principal, IDL.Text, IDL.Text],
            [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })],
            []
        ),
    });
};

export const matchingEngineIdl = ({ IDL }) => {
    const Intent = IntentDef(IDL);
    const Error = CHError(IDL);

    const OrderStatus = IDL.Variant({
        'Failed': IDL.Text,
        'Settling': IDL.Null,
        'Locked': IDL.Null,
        'Cancelled': IDL.Null,
        'Settled': IDL.Null
    });
    const SettlementResult = IDL.Variant({
        'Ok': IDL.Null,
        'Err': IDL.Text
    });
    const Order = IDL.Record({
        'id': IDL.Nat64,
        'status': OrderStatus,
        'intent': Intent,
        'timestamp': IDL.Nat64,
        'hash': IDL.Vec(IDL.Nat8),
        'prev_order_hash': IDL.Opt(IDL.Vec(IDL.Nat8)),
        'settlement_result': IDL.Opt(SettlementResult)
    });

    return IDL.Service({
        'get_next_sequence_number': IDL.Func([IDL.Principal], [IDL.Nat64], ['query']),
        'submit_intent': IDL.Func([Intent], [IDL.Variant({ 'Ok': IDL.Nat64, 'Err': Error })], []),
        'get_order': IDL.Func([IDL.Nat64], [IDL.Opt(Order)], ['query']),
        'list_orders': IDL.Func([], [IDL.Vec(Order)], ['query']),
        'cancel_order': IDL.Func([IDL.Nat64], [IDL.Variant({ 'Ok': IDL.Null, 'Err': Error })], []),
    });
};
