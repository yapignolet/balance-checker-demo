export const idlFactory = ({ IDL }) => {
    return IDL.Service({
        'get_eth_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text })], []),
        'get_sol_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text })], []),
    });
};

export const ethTransferIdl = ({ IDL }) => {
    return IDL.Service({
        'get_eth_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text })], []),
        'get_balances': IDL.Func([IDL.Principal], [IDL.Variant({
            'Ok': IDL.Record({ 'eth': IDL.Text, 'usdc': IDL.Text, 'eurc': IDL.Text }),
            'Err': IDL.Unknown
        })], []),
    });
};

export const solTransferIdl = ({ IDL }) => {
    return IDL.Service({
        'get_sol_address': IDL.Func([IDL.Principal], [IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text })], []),
        'get_balances': IDL.Func([IDL.Principal], [IDL.Variant({
            'Ok': IDL.Record({ 'sol': IDL.Text, 'eurc': IDL.Text, 'usdc': IDL.Text }),
            'Err': IDL.Unknown
        })], []),
    });
};
