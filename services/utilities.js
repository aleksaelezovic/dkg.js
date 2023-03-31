const jsonld = require('jsonld');
const BlockchainError = require('./custom-errors');
const { GRAPH_LOCATIONS, GRAPH_STATES, OT_NODE_TRIPLE_STORE_REPOSITORIES } = require('../constants.js');

module.exports = {
    nodeSupported() {
        return typeof window === 'undefined';
    },
    isEmptyObject(object) {
        // eslint-disable-next-line no-unreachable-loop
        for (const key in object) {
            return false;
        }
        return true;
    },
    toNumber(hex) {
        return parseInt(hex.slice(2), 16);
    },
    deriveUAL(blockchain, contract, tokenId) {
        return `did:dkg:${
            blockchain.startsWith('otp') ? 'otp' : blockchain.toLowerCase()
        }/${contract.toLowerCase()}/${tokenId}`;
    },
    resolveUAL(ual) {
        const segments = ual.split(':');
        const argsString = segments.length === 3 ? segments[2] : segments[2] + segments[3];
        const args = argsString.split('/');

        if (args.length !== 3) {
            throw new Error(`UAL doesn't have correct format: ${ual}`);
        }

        return {
            blockchain: args[0],
            contract: args[1],
            tokenId: parseInt(args[2], 10),
        };
    },
    deriveRepository(graphLocation, graphState) {
        switch (graphLocation + graphState) {
            case GRAPH_LOCATIONS.PUBLIC_KG + GRAPH_STATES.CURRENT:
                return OT_NODE_TRIPLE_STORE_REPOSITORIES.PUBLIC_CURRENT;
            case GRAPH_LOCATIONS.PUBLIC_KG + GRAPH_STATES.HISTORICAL:
                return OT_NODE_TRIPLE_STORE_REPOSITORIES.PUBLIC_HISTORY;
            case GRAPH_LOCATIONS.LOCAL_KG + GRAPH_STATES.CURRENT:
                return OT_NODE_TRIPLE_STORE_REPOSITORIES.PRIVATE_CURRENT;
            case GRAPH_LOCATIONS.LOCAL_KG + GRAPH_STATES.HISTORICAL:
                return OT_NODE_TRIPLE_STORE_REPOSITORIES.PRIVATE_HISTORY;
            default:
                throw new Error(
                    `Unknown graph location and state: ${graphLocation}, ${graphState}`,
                );
        }
    },
    async sleepForMilliseconds(milliseconds) {
        // eslint-disable-next-line no-promise-executor-return
        await new Promise((r) => setTimeout(r, milliseconds));
    },
    capitalizeFirstLetter(str) {
        return str[0].toUpperCase() + str.slice(1);
    },
    getOperationStatusObject(operationResult, operationId) {
        const operationData = operationResult.data?.errorType
            ? { status: operationResult.status, ...operationResult.data }
            : { status: operationResult.status };

        return {
            operationId,
            ...operationData,
        };
    },
    async toNQuads(content, inputFormat) {
        const options = {
            algorithm: 'URDNA2015',
            format: 'application/n-quads',
        };

        if (inputFormat) {
            options.inputFormat = inputFormat;
        }

        const canonized = await jsonld.canonize(content, options);

        return canonized.split('\n').filter((x) => x !== '');
    },
    async toJSONLD(nquads) {
        return jsonld.fromRDF(nquads, {
            algorithm: 'URDNA2015',
            format: 'application/n-quads',
        });
    },
    handleContractUpdates(func, maxAttempts) {
        return async function decoratedFunction(...args) {
            let attempt = 1;
            while(attempt <= maxAttempts) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    return await func(...args);
                } catch (error) {
                    if (error instanceof BlockchainError) {
                        const { baseObject, blockchain, contractName, contractInstance } = error;
                        // eslint-disable-next-line no-await-in-loop
                        const status = await contractInstance.methods.status.call();
                        if (status === false) {
                            baseObject.updateContractInstance(contractName, blockchain);
                        }
                    }
                    if (attempt === maxRetries) {
                        throw error;
                    }
                    attempt += 1;
                }
            }
            return null;
        };
    }
};
