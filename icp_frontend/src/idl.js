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

export const ethTransferIdl = ({ IDL }) => {
    const Symbol = AssetSymbol(IDL);
    const Error = CHError(IDL);
    return IDL.Service({
        'get_eth_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })], []),
        'get_balances': IDL.Func([IDL.Principal], [IDL.Variant({
            'Ok': IDL.Record({ 'eth': IDL.Text, 'usdc': IDL.Text, 'eurc': IDL.Text }),
            'Err': Error
        })], []),
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
    return IDL.Service({
        'get_sol_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': Error })], []),
        'get_balances': IDL.Func([IDL.Principal], [IDL.Variant({
            'Ok': IDL.Record({ 'sol': IDL.Text, 'eurc': IDL.Text, 'usdc': IDL.Text }),
            'Err': Error
        })], []),
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
