const Minomy = require("..")
const Unidirectional = require('@machinomy/contracts/build/contracts/Unidirectional.json')
const TokenUnidirectional = require('@machinomy/contracts/build/contracts/TokenUnidirectional.json')
const Web3 = require('web3')
const BN = require('bn.js')

describe('Class Instantiation', () => {
    let mockTokenAddress = "0x234"
    let mockTokenAbi = {}
    test('Throws if no args are passed', () => {
        expect(() => {
            const minomy = new Minomy()
        }).toThrow()
    })
    
    test('should create a Minomy instance with 2 arguments in the Unidirectional contract is used', () => {
        expect(new Minomy(Unidirectional, new Web3())).toBeInstanceOf(Minomy)
    })

    test('Throws if Unidirectional is contract and there are 4 arguments', () => {
        expect(() => {
            const minomy = new Minomy(Unidirectional, new Web3(), mockTokenAddress, mockTokenAbi)
        }).toThrow()
    })

    test('Throws if TokenUnidirectional is contract and there is no abi or tokenaddress', () => {
        expect(() => {
            const minomy = new Minomy(TokenUnidirectional, new Web3())
        }).toThrow()
    })

    test('Throws if TokenUnidirectional is contract and there is no abi', () => {
        expect(() => {
            const minomy = new Minomy(TokenUnidirectional, new Web3(), mockTokenAddress)
        }).toThrow()
    })
    
    test('Throws if TokenUnidirectional is contract and there is no address', () => {
        expect(() => {
            const minomy = new Minomy(TokenUnidirectional, new Web3(), mockTokenAbi)
        }).toThrow()
    })

    test('should create a Minomy instance with 4 arguments if the TokenUnidirectional contract is used', () => {
        expect(new Minomy(TokenUnidirectional, new Web3(), mockTokenAddress, mockTokenAbi)).toBeInstanceOf(Minomy)
    })
})

describe('Channel Open', () => {
    let mockAddress
    let mockValue
    let mockChannelId
    let mockData
    let mockReceiver
    let mockGas
    let mockGasPrice
    let mockTx
    let minomy
    beforeEach(() => {
        mockAddress = '0x12345'
        mockValue = new BN(100)
        mockChannelId = '0xabc'
        mockData = "0xfd745bcee72cb3c62"
        mockReceiver = '0x54321'
        mockGas = 10000
        mockGasPrice = 100000000
        mockTx = {
            data: mockData,
            from: mockAddress,
            gas: mockGas,
            gasPrice: mockGasPrice,
            to: mockReceiver,
            value: mockValue.toString('hex') }
        minomy = new Minomy(Unidirectional, new Web3())
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {open: jest.fn().mockReturnValue("Mock Return")}}
        )
        minomy._generateTx = jest.fn().mockResolvedValue( 
            mockTx
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })
    test('OpenChannelTx calls _getContractInstance', () => {
        
        minomy._generateChannelId = jest.fn().mockResolvedValue(mockChannelId)
        minomy.openChannelTx({ mockAddress, mockValue })
        expect(minomy._getContractInstance).toHaveBeenCalledTimes(1)
    })
    test('OpenChannelTx does not call _generateChannelId if a channelId is passed.', () => {
        minomy._generateChannelId = jest.fn().mockResolvedValue(mockChannelId)
        minomy.openChannelTx(
            { address: mockAddress, value: mockValue, channelId: mockChannelId }
        )
        expect(minomy._generateChannelId).not.toHaveBeenCalled()
    })
    test('OpenChannelTx calls _generateChannelId if a channelId is not passed.', async () => {
        minomy._generateChannelId = jest.fn().mockResolvedValue(mockChannelId)
        await minomy.openChannelTx(
            { address: mockAddress, value: mockValue }
        )
        expect(minomy._generateChannelId).toHaveBeenCalled()
    })
    test('OpenChannelTx returns the mock transaction and mock channelID', async () => {
        await expect(
            minomy.openChannelTx(
                { address: mockAddress, value: mockValue, channelId: mockChannelId }
            )).resolves.toEqual(
                { channelId: mockChannelId, tx: mockTx }
            )
    })
    test('OpenChannelTx returns the mock transaction and mock channelID for ERC20 contract', async () => {
        let erc20 = new Minomy(TokenUnidirectional, new Web3(), 'tokenAddress', 'tokenAbi')
        erc20._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {open: jest.fn().mockReturnValue("Mock Return")}}
        )
        erc20._generateTx = jest.fn().mockResolvedValue( 
            mockTx
        )
        await expect(
            erc20.openChannelTx(
                { address: mockAddress, value: mockValue, channelId: mockChannelId }
            )).resolves.toEqual(
                { channelId: mockChannelId, tx: mockTx }
            )
    })
})

describe('Fetching channel info', () => {
    let mockAddress
    let mockValue
    let mockChannelId
    let mockReceiver    
    let mockChannel
    let mockChannelReturn
    let mockClosingChannel
    let minomy
    beforeEach(() => {
        mockAddress = '0x12345'
        mockValue = new BN(100)
        mockChannelId = '0xabc'
        mockReceiver = '0x54321'
        mockChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: '0', // settlingUntil returns as '0' in a normal web3 call
            value: mockValue }
        mockChannelReturn = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: undefined, // settlingUntil decomes undefined in getChannel
            value: mockValue }
        mockClosingChannel = {
            channelId: '0x0000',
            receiver: '0x0000',
            sender: '0x0000',
            settlingPeriod: '0',
            settlingUntil: '0', // settlingUntil decomes undefined in getChannel
            value: '0' }
        minomy = new Minomy(Unidirectional, new Web3())

    })

    afterEach(() => {
        jest.clearAllMocks()
    })
    test('Fetches the channel when one exists (sender is not the empty address)', async () => {
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {channels: jest.fn().mockReturnValue({
                call: jest.fn().mockReturnValue(mockChannel)
            }
        )}})
        await expect(
            minomy.getChannel(mockChannelId)
        ).resolves.toEqual(mockChannelReturn)
    })
    test('Throws if the channel does not exist (sender is empty address)', async () => {
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {channels: jest.fn().mockReturnValue({
                call: jest.fn().mockReturnValue(mockClosingChannel)
            }
        )}})
        await expect(
            minomy.getChannel(mockChannelId)
        ).rejects.toEqual(new Error('Failed to fetch channel details: channel not found or already closed'))
    })
})

describe('Depositing to a channel', () => {
    let mockAddress
    let mockValue
    let mockChannelId
    let mockReceiver    
    let mockChannel
    let mockGas
    let mockGasPrice
    let mockClosingChannel
    let mockWeb3
    let mockBadWeb3
    let mockTx
    let minomy
    let mockData
    beforeEach(() => {
        mockAddress = '0x12345'
        mockValue = new BN(100)
        mockChannelId = '0xabc'
        mockReceiver = '0x54321'
        mockData = "0xfd745bcee72cb3c62"
        mockGas = 10000
        mockGasPrice = 100000000
        mockChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: undefined, // settlingUntil returns as '0' in a normal web3 call
            value: mockValue }
        mockClosingChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: 100, // settlingUntil returns as '0' in a normal web3 call
            value: mockValue
        }
        mockBadWeb3 = {eth: {defaulAccount: '0x', accounts: {wallet: [{address: '0x'}]}}}
        mockWeb3 = {eth: {defaulAccount: '0x12345', accounts: {wallet: [{address: '0x12345'}]}}}
        mockTx = {
            data: mockData,
            from: mockAddress,
            gas: mockGas,
            gasPrice: mockGasPrice,
            to: mockReceiver,
            value: mockValue.toString('hex') }
    })
    afterEach(() => {
        jest.clearAllMocks()
    })
    test('Throws for zero value deposit', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        await expect(
            minomy.depositToChannelTx(mockChannelId, new BN(0))
        ).rejects.toEqual(new Error(`Failed to deposit: can't deposit for 0 or negative amount`))
    })
    test('Throws for negative value deposit', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        await expect(
            minomy.depositToChannelTx(mockChannelId, new BN(-100))
        ).rejects.toEqual(new Error(`Failed to deposit: can't deposit for 0 or negative amount`))
    })
    test('Throws if account is not the sender', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockClosingChannel)
        await expect(
            minomy.depositToChannelTx(mockChannelId, mockValue)
        ).rejects.toEqual(new Error(`Failed to deposit: channel is not open`))
    })
    test('Throws if channel is closing', async () => {
        minomy = new Minomy(Unidirectional, mockBadWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        await expect(
            minomy.depositToChannelTx(mockChannelId, mockValue)
        ).rejects.toEqual(new Error(`Failed to deposit: Default account is not the sender`))
    })
    test('Returns mock transaction if sender is account and value is positive', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {deposit: jest.fn().mockReturnValue("Mock Return")}}
        )
        minomy._generateTx = jest.fn().mockResolvedValue( 
            mockTx
        )
        await expect(
            minomy.depositToChannelTx(mockChannelId, mockValue)
        ).resolves.toEqual(mockTx)
    })
})

describe('Create Claim', () => {
    let mockAddress
    let mockValue
    let mockChannelId
    let mockReceiver    
    let mockChannel
    let mockClosingChannel
    let mockInsufficientChannel
    let mockWeb3
    let mockBadWeb3
    let minomy
    beforeEach(() => {
        mockAddress = '0x12345'
        mockValue = new BN(100)
        mockChannelId = '0xabc'
        mockReceiver = '0x54321'
        mockWeb3 = {eth: 
            {defaulAccount: '0x12345',
             accounts: {wallet: [{address: '0x12345'}]},
            sign: jest.fn().mockResolvedValue('Mock Signature')}}
        mockChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: undefined, // settlingUntil returns as '0' in a normal web3 call
            value: mockValue }
        mockClosingChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: 100, // settlingUntil returns as '0' in a normal web3 call
            value: mockValue
        }
        mockInsufficientChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: undefined, // settlingUntil returns as '0' in a normal web3 call
            value: new BN(10)
        }
        mockBadWeb3 = {eth: {defaulAccount: '0x', accounts: {wallet: [{address: '0x'}]}}}
        mockClaim = {
            channelId: mockChannelId,
            value: mockValue.toString(),
            signature: 'Mock Signature'
        }
    })
    afterEach(() => {
        jest.clearAllMocks()
    })
    test('Throws for zero value deposit', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        await expect(
            minomy.createClaim({ channelId: mockChannelId, value: new BN(0) })
        ).rejects.toEqual(new Error(`Failed to create claim: can't create claim for 0 or negative amount`))
    })
    test('Throws for negative value deposit', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        await expect(
            minomy.createClaim({ channelId: mockChannelId, value: new BN(-100) })
        ).rejects.toEqual(new Error(`Failed to create claim: can't create claim for 0 or negative amount`))
    })
    test('Throws if account is not the sender', async () => {
        minomy = new Minomy(Unidirectional, mockBadWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        await expect(
            minomy.createClaim({ channelId: mockChannelId, value: mockValue })
        ).rejects.toEqual(new Error(`Failed to create claim: Default account is not the sender`))
    })
    test('Throws if channel is closing', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockClosingChannel)
        await expect(
            minomy.createClaim({ channelId: mockChannelId, value: mockValue })
        ).rejects.toEqual(new Error(`Failed to create claim: channel is not open`))
    })
    test('Throws if channel has insufficient funds', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockInsufficientChannel)
        await expect(
            minomy.createClaim({ channelId: mockChannelId, value: mockValue })
        ).rejects.toEqual(new Error(`Failed to create claim: total spend is larger than channel value`))
    })
    test('Returns mock claim for valid inputs', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {paymentDigest: jest.fn().mockReturnValue({
                call: jest.fn().mockReturnValue("Mock Digest")
            }
        )}})
        await expect(
            minomy.createClaim({ channelId: mockChannelId, value: mockValue })
        ).resolves.toEqual(mockClaim)
    })
})

describe('Validate Claim', () => {
    let mockAddress
    let mockValue
    let mockChannelId
    let mockReceiver
    let mockClaim
    let mockChannel
    let mockWeb3
    let mockBadWeb3
    let mockTooLargeClaim
    let mockZeroClaim
    let mockNegativeClaim
    beforeEach(() => {
        mockAddress = '0x12345'
        mockValue = new BN(100)
        mockChannelId = '0xabc'
        mockReceiver = '0x54321'
        mockClaim = {
            channelId: mockChannelId,
            value: mockValue.toString(),
            signature: 'Mock Signature'
        }
        mockChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: undefined, // settlingUntil returns as '0' in a normal web3 call
            value: mockValue }
        mockWeb3 = {eth: 
            {defaulAccount: '0x54321',
                accounts: {wallet: [{address: '0x54321'}]}}}
        mockBadWeb3 = {eth: 
            {defaulAccount: '0x',
                accounts: {wallet: [{address: '0x'}]}}}
    })
    afterEach(() => {
        jest.clearAllMocks()
    })
    test('Throws if the account does not match the receiver', async () => {
        minomy = new Minomy(Unidirectional, mockBadWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        await expect(
            minomy.validateClaim(mockClaim)
        ).rejects.toEqual(new Error(`Invalid claim: default account is not the receiver`))
    })
    test('Throws if claim value is larger than channel value', async () => {
        minomy = new Minomy(Unidirectional, mockBadWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {canClaim: jest.fn().mockReturnValue({
                call: jest.fn().mockReturnValue(true)
            }
        )}})
        await expect(
            minomy.validateClaim(mockClaim)
        ).rejects.toEqual(new Error(`Invalid claim: default account is not the receiver`))
    })
    test('Throws if claim value is more than channel', async () => {
        mockTooLargeClaim = {
            channelId: mockChannelId,
            value: new BN(1000).toString(),
            signature: 'Mock Signature'
        }
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {canClaim: jest.fn().mockReturnValue({
                call: jest.fn().mockReturnValue(true)
            }
        )}})
        await expect(
            minomy.validateClaim(mockTooLargeClaim)
        ).rejects.toEqual(new Error(`Invalid claim: claim value is greater than amount in channel`))
    })
    test('Throws if claim value is zero or negative', async () => {
        mockZeroClaim = {
            channelId: mockChannelId,
            value: new BN(0).toString(),
            signature: 'Mock Signature'
        }
        mockNegativeClaim = {
            channelId: mockChannelId,
            value: new BN(-100).toString(),
            signature: 'Mock Signature'
        }
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {canClaim: jest.fn().mockReturnValue({
                call: jest.fn().mockReturnValue(true)
            }
        )}})
        await expect(
            minomy.validateClaim(mockZeroClaim)
        ).rejects.toEqual(new Error(`Invalid claim: claim is zero or negative`))
        await expect(
            minomy.validateClaim(mockNegativeClaim)
        ).rejects.toEqual(new Error(`Invalid claim: claim is zero or negative`))
    })
    test('Returns for valid inputs', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {canClaim: jest.fn().mockReturnValue({
                call: jest.fn().mockReturnValue(true)
            }
        )}})
        await expect(
            minomy.validateClaim(mockClaim).resolves
        )
    })
})

describe('Closing a channel', () => {
    let mockAddress
    let mockValue
    let mockChannelId
    let mockReceiver
    let mockClaim
    let mockChannel
    let mockWeb3Sender
    let mockGas
    let mockGasPrice
    let mockWeb3Receiver
    let minomy
    let mockTx
    let mockData
    beforeEach(() => {
        mockAddress = '0x12345'
        mockValue = new BN(100)
        mockChannelId = '0xabc'
        mockReceiver = '0x54321'
        mockData = "0xfd745bcee72cb3c62"
        mockGas = "10000"
        mockGasPrice = "1000000"
        mockClaim = {
            channelId: mockChannelId,
            value: mockValue.toString(),
            signature: 'Mock Signature'
        }
        mockTx = {
            data: mockData,
            from: mockAddress,
            gas: mockGas,
            gasPrice: mockGasPrice,
            to: mockReceiver,
            value: mockValue.toString('hex') }
        mockChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: undefined, // settlingUntil returns as '0' in a normal web3 call
            value: mockValue }
        mockWeb3Sender = {eth: 
            {
                defaulAccount: '0x12345',
                accounts: {wallet: [{address: '0x12345'}]},
                getBlockNumber : jest.fn().mockResolvedValue(2)
            }}
        mockWeb3Receiver = {eth: 
            {defaulAccount: '0x54321',
                accounts: {wallet: [{address: '0x54321'}]}}}
    })
    afterEach(() => {
        jest.clearAllMocks()
    })
    test('Throws if the receiver does not include a claim', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3Receiver)

        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {
                claim: jest.fn().mockReturnValue("Mock Claim Return"),
                settle: jest.fn().mockReturnValue("Mock Settle Return"),
                startSettling: jest.fn().mockReturnValue("Mock Start Settling Return")
            }}
        )
        await expect(
            minomy.closeChannelTx({ channelId: mockChannelId, claim: undefined})
        ).rejects.toEqual(
            new Error(`Failed to settle: Failed to claim: Cannot claim channel on behalf of receiver: No claim given.`)) 
    })
    test('Returns mock Tx if the receiver is valid and includes a valid claim', async () => {
        minomy = new Minomy(Unidirectional, mockWeb3Receiver)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {
                claim: jest.fn().mockReturnValue("Mock Claim Return"),
                settle: jest.fn().mockReturnValue("Mock Settle Return"),
                startSettling: jest.fn().mockReturnValue("Mock Start Settling Return")
            }}
        )
        minomy.validateClaim = jest.fn().mockResolvedValue(true)
        minomy._generateTx = jest.fn().mockResolvedValue(mockTx)
        await expect(
            minomy.closeChannelTx({ channelId: mockChannelId, claim: mockClaim})
        ).resolves.toEqual(mockTx) 
    })
    test('Returns start settling mock Tx if sender initiates.', async () => {
        let mockStartSettlingTx = {
            data: "Start Settling",
            from: mockAddress,
            gas: mockGas,
            gasPrice: mockGasPrice,
            to: mockReceiver,
            value: mockValue.toString('hex') }
        minomy = new Minomy(Unidirectional, mockWeb3Sender)
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {
                claim: jest.fn().mockReturnValue("Mock Claim Return"),
                settle: jest.fn().mockReturnValue("Mock Settle Return"),
                startSettling: jest.fn().mockReturnValue("Mock Start Settling Return")
            }}
        )
        minomy._generateTx = jest.fn().mockResolvedValue(mockStartSettlingTx)
        await expect(
            minomy.closeChannelTx({ channelId: mockChannelId, claim: undefined})
        ).resolves.toEqual(mockStartSettlingTx) 
    })
    test('Throws if sender calls and settling period is not over', async () => {
        mockWeb3Sender = {eth: 
            {
                defaulAccount: '0x12345',
                accounts: {wallet: [{address: '0x12345'}]},
                getBlockNumber : jest.fn().mockResolvedValue(1)
            }}
        mockChannel = mockChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: new BN(2),
            value: mockValue }
        minomy = new Minomy(Unidirectional, mockWeb3Sender)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {
                claim: jest.fn().mockReturnValue("Mock Claim Return"),
                settle: jest.fn().mockReturnValue("Mock Settle Return"),
                startSettling: jest.fn().mockReturnValue("Mock Start Settling Return")
            }}
        )
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        await expect(
            minomy.closeChannelTx({ channelId: mockChannelId, claim: undefined})
        ).rejects.toEqual(
            new Error(`Failed to settle: Failed to settle: 1 blocks remaining in settling period`)) 
    })
    test('Returns settle mock Tx if sender calls and settling period is over', async () => {
        mockWeb3Sender = {eth: 
            {
                defaulAccount: '0x12345',
                accounts: {wallet: [{address: '0x12345'}]},
                getBlockNumber : jest.fn().mockResolvedValue(2)
            }}
        mockChannel = mockChannel = {
            channelId: mockChannelId,
            receiver: mockReceiver,
            sender: mockAddress,
            settlingPeriod: new BN(40320),
            settlingUntil: new BN(1),
            value: mockValue }
        let mockSettlingTx = {
            data: "Settling",
            from: mockAddress,
            gas: mockGas,
            gasPrice: mockGasPrice,
            to: mockReceiver,
            value: mockValue.toString('hex') }
        minomy = new Minomy(Unidirectional, mockWeb3Sender)
        minomy._getContractInstance = jest.fn().mockResolvedValue(
            {methods: {
                claim: jest.fn().mockReturnValue("Mock Claim Return"),
                settle: jest.fn().mockReturnValue("Mock Settle Return"),
                startSettling: jest.fn().mockReturnValue("Mock Start Settling Return")
            }}
        )
        minomy.getChannel = jest.fn().mockResolvedValue(mockChannel)
        minomy._generateTx = jest.fn().mockResolvedValue(mockSettlingTx)
        await expect(
            minomy.closeChannelTx({ channelId: mockChannelId, claim: undefined})
        ).resolves.toEqual(mockSettlingTx) 
    })
})
