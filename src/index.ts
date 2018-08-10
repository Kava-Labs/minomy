import Web3 = require('web3')
import { Tx, TransactionObject } from 'web3/eth/types'
import BigNumber from 'bignumber.js'
import { randomBytes } from 'crypto'
import { promisify } from 'util'
const Unidirectional = require('@machinomy/contracts/build/contracts/Unidirectional.json')

export interface Channel {
  channelId: string
  receiver: string
  sender: string
  settlingPeriod: BigNumber
  // settlingUntil is defined if channel is settling; otherwise, the channel is open
  settlingUntil?: BigNumber
  value: BigNumber
}

export interface Payment {
  channelId: string,
  value: string,
  signature: string
}

const DEFAULT_SETTLEMENT_PERIOD = 40320 // ~1 week, given 15 second blocks

const getContractAddress = async (web3: Web3) => {
  const chainId = await web3.eth.net.getId()
  const contractAddress = Unidirectional.networks[chainId].address

  if (!contractAddress) {
    throw new Error('Machinomy is not supported on the current network')
  }

  return contractAddress
}

const getContract = async (web3: Web3) => {
  return new web3.eth.Contract(Unidirectional.abi, await getContractAddress(web3), {
    from: getAccount(web3)
  })
}

const getChannel = async (web3: Web3, channelId: string): Promise<Channel> => {
  try {
    const contract = await getContract(web3)
    let {
      sender, receiver, settlingUntil, settlingPeriod, value
    } = await contract.methods.channels(channelId).call()

    // Minimic the check done at the contract level (check for empty address 0x00000...)
    if (web3.utils.toBN(sender).isZero()) {
      throw new Error(`channel not found or already closed`)
    }

    // In contract, `settlingUntil` should be positive if settling, 0 if open (contract checks if settlingUntil != 0)
    settlingUntil = settlingUntil !== '0'
      ? new BigNumber(settlingUntil)
      : undefined

    return {
      channelId,
      receiver,
      sender,
      settlingUntil,
      settlingPeriod: new BigNumber(settlingPeriod),
      value: new BigNumber(value)
    }
  } catch (err) {
    throw new Error(`Failed to fetch channel details: ${err.message}`)
  }
}

const getAccount = (web3: Web3): string => {
  try {
    return web3.eth.defaultAccount || web3.eth.accounts.wallet[0].address
  } catch (err) {
    throw new Error(`no account exists in the given Web3 instance`)
  }
}

const generateTx = async (web3: Web3, txObj: TransactionObject<any>, value: BigNumber.Value): Promise<Tx> => {
  const tx = {
    data: txObj.encodeABI(),
    value: new BigNumber(value).toString(),
    from: getAccount(web3)
  }

  const gasPrice = await web3.eth.getGasPrice()
  const gas = await txObj.estimateGas(tx)

  return { ...tx, gas, gasPrice }
}

const generateChannelId = async () =>
  '0x' + (await promisify(randomBytes)(32)).toString('hex')

const openChannel = async (web3: Web3, { address, value, channelId, settlingPeriod }: {
  address: string
  value: BigNumber.Value
  settlingPeriod?: number
  channelId?: string
}): Promise<{
  tx: Tx,
  channelId: string
}> => {
  try {
    const contract = await getContract(web3)
    channelId = channelId || await generateChannelId()
    settlingPeriod = settlingPeriod || DEFAULT_SETTLEMENT_PERIOD

    const openTx = contract.methods.open(
      channelId,
      address,
      settlingPeriod
    )

    const tx = await generateTx(web3, openTx, value)

    return { tx, channelId }
  } catch (err) {
    throw new Error(`Failed to open channel: ${err.message}`)
  }
}

const isSettling = (channel: Channel) =>
  !!channel.settlingUntil

const depositToChannel = async (web3: Web3, { channelId, value }: {
  channelId: string,
  value: BigNumber.Value
}): Promise<Tx> => {
  try {
    const isPositive = new BigNumber(value).gt(0)
    if (!isPositive) {
      throw new Error(`can't deposit for 0 or negative amount`)
    }

    const channel = await getChannel(web3, channelId)

    const amSender = channel.sender === getAccount(web3)
    if (!amSender) {
      throw new Error('default account is not the sender')
    }

    if (isSettling(channel)) {
      throw new Error(`channel is not open`)
    }

    const contract = await getContract(web3)
    const depositTx = contract.methods.deposit(channelId)

    return await generateTx(web3, depositTx, value)
  } catch (err) {
    throw new Error(`Failed to deposit: ${err.message}`)
  }
}

const createPayment = async (web3: Web3, { channelId, value }: {
  channelId: string
  value: BigNumber.Value
}): Promise<Payment> => {
  try {
    const isPositive = new BigNumber(value).gt(0)
    if (!isPositive) {
      throw new Error(`can't create payment for 0 or negative amount`)
    }

    const channel = await getChannel(web3, channelId)

    const amSender = channel.sender === getAccount(web3)
    if (!amSender) {
      throw new Error('default account is not the sender')
    }

    if (isSettling(channel)) {
      throw new Error(`channel is not open`)
    }

    if (new BigNumber(value).gt(channel.value)) {
      throw new Error(`total spend is larger than channel value`)
    }
    
    const contract = await getContract(web3)
    const digest = await contract.methods.paymentDigest(channelId, value).call()

    const signature = await web3.eth.sign(digest, getAccount(web3))

    // Serialize the payment
    return {
      channelId,
      value: new BigNumber(value).toString(),
      signature
    }
  } catch (err) {
    throw new Error(`Failed to create payment: ${err.message}`)
  }
}

const validatePayment = async (web3: Web3, payment: Payment): Promise<void> => {
  try {
    const channel = await getChannel(web3, payment.channelId)
    
    const address = getAccount(web3)
    if (channel.receiver !== address) {
      throw new Error(`default account is not the receiver`)
    }
    
    const contract = await getContract(web3)

    const canClaim = await contract.methods.canClaim(
      payment.channelId,
      payment.value,
      address,
      payment.signature
    ).call()
    if (!canClaim) {
      throw new Error(`not signed by sender of the channel`)
    }

    const isValidPaymentValue = new BigNumber(payment.value)
      .lte(new BigNumber(channel.value))
    if (!isValidPaymentValue) {
      throw new Error(`payment value is greater than amount in channel`)
    }

    const isPositive = new BigNumber(payment.value).gt(0)
    if (!isPositive) {
      throw new Error(`payment is zero or negative`)
    }
  } catch (err) {
    throw new Error(`Invalid payment: ${err.message}`)
  }
}

const closeChannel = async (web3: Web3, { channelId, payment }: {
  channelId: string
  payment?: Payment
}): Promise<Tx> => {
  try {
    const contract = await getContract(web3)
    const channel = await getChannel(web3, channelId)
  
    // If we're the receiver: claim the channel
    const address = getAccount(web3)
    if (channel.receiver === address) {
      try {
        if (!payment) {
          throw new Error(`no payment given`)
        }

        // Verify the payment is valid/channel can be claimed
        await validatePayment(web3, payment)
  
        const claimTx = contract.methods.claim(payment.channelId, payment.value, payment.signature)
  
        return await generateTx(web3, claimTx, 0)
      } catch (err) {
        throw new Error(`Failed to claim: ${err.message}`)
      }
    }
    // If we're the sender: settle
    else if (channel.sender === address) {
      // If channel is settling, try to settle
      if (isSettling(channel)) {
        try {
          const blockNumber = await web3.eth.getBlockNumber()
          const blocksRemaining = (channel.settlingUntil as BigNumber).minus(blockNumber)
          if (blocksRemaining.gt(0)) {
            throw new Error(`${blocksRemaining} blocks remaining in settling period`)
          }
          
          const settleTx = await contract.methods.settle(channelId)
          
          return await generateTx(web3, settleTx, 0)
        } catch (err) {
          throw new Error(`Failed to settle: ${err.message}`)
        }
      }
      // If channel is open, try to begin settlement period
      else {
        try {
          const settleTx = await contract.methods.startSettling(channelId)
  
          return await generateTx(web3, settleTx, 0)
        } catch (err) {
          throw new Error(`Failed to start settling: ${err.message}`)
        }
      }
    } else {
      throw new Error(`default account is not the sender nor receiver`)
    }
  } catch (err) {
    throw new Error(`Failed to close: ${err.message}`)
  }
}

export {
  // Channels
  getChannel,
  openChannel,
  depositToChannel,
  closeChannel,

  // Payments
  createPayment,
  validatePayment
}
