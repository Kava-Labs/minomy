import Web3 = require('web3')
import { TransactionObject } from 'web3/eth/types'
import BN = require('bn.js')
import { randomBytes } from 'crypto'
import { promisify } from 'util'

interface Channel {
  channelId: string
  receiver: string
  sender: string
  settlingPeriod: BigNumber
  // settlingUntil is defined if channel is settling; otherwise, the channel is open
  settlingUntil?: BigNumber
  value: BigNumber
}

interface Claim {
  channelId: string,
  value: string,
  signature: string
}

interface Tx {
  nonce?: string | number
  chainId?: string | number
  to?: string 
  from: string
  data: string
  value: string | number
  gas: string | number
  gasPrice: string | number
}

const DEFAULT_SETTLEMENT_PERIOD = 40320 // ~1 week, given 15 second blocks

class Minomy {
  contract: any
  web3: Web3
  private tokenAddress?: string
  private tokenAbi?: object
  constructor (contract: object, web3: Web3, tokenAddress?: string, tokenAbi?: object) {
    this.contract = contract
    this.web3 = web3
    this.tokenAddress = tokenAddress
    this.tokenAbi = tokenAbi
    if (this.contract.contractName === 'TokenUnidirectional' && !this.tokenAddress) {
      throw new Error('No tokenAddress defined for TokenUnidirectional contract. Use Unidirectional contract for ETH payment channels.')
    }
    if (this.contract.contractName === 'TokenUnidirectional' && !this.tokenAbi) {
      throw new Error('No tokenAbi defined for TokenUnidirectional contract. Use Unidirectional contract for ETH payment channels.')
    }
    if (this.contract.contractName === 'Unidirectional' && this.tokenAddress) {
      throw new Error('tokenAddress defined for Unidirectional contract. Use TokenUnidirectional contract for ERC20 tokens.')
    }
    if (this.contract.contractName === 'Unidirectional' && this.tokenAbi) {
      throw new Error('tokenAbi defined for Unidirectional contract. Use TokenUnidirectional contract for ERC20 tokens.')
    }
  }
  async _getContractInstance (): Promise<any> {
    try {
      const chainId = await this.web3.eth.net.getId()
      const contractAddress = this.contract.networks[chainId].address
      if (!contractAddress) {
        throw new Error(`Machinomy contract ${this.contract.contractName} is not deployed on network ${chainId}`)
      }
      return new this.web3.eth.Contract(this.contract.abi, contractAddress)
    } catch (err) {
      throw new Error(`Failed to get contract instance: ${err.message}`)
    }
  }

  async _generateChannelId () {
    return '0x' + (await promisify(randomBytes)(32)).toString('hex')
  }

  async _generateTx (txObj: TransactionObject<any>, value: BN | string | number = 0): Promise<Tx> {
    const account = this.web3.eth.defaultAccount || this.web3.eth.accounts.wallet[0].address
    const tx = {
      data: txObj.encodeABI(),
      value: new BN(value).toString(),
      from: account
    }

    const gasPrice = await this.web3.eth.getGasPrice()
    const gas = await txObj.estimateGas(tx)
    return { ...tx, gas, gasPrice }

  }

  async approveTokenTransferTx (value: BN | string | number): Promise<Tx> {
    try {
      const contractInstance = await this._getContractInstance()
      const tokenContractInstance = new this.web3.eth.Contract(this.tokenAbi as any[], this.tokenAddress)
      const approveTx = tokenContractInstance.methods.approve(
        contractInstance._address, new BN(value).toString()
      )
      const tx = await this._generateTx(approveTx)
      return tx
    } catch (err) {
      throw new Error(`Failed to approve token transfer: ${err.message}`)
    }
  }

  async openChannelTx (
    { address, value, channelId, settlingPeriod }: {
      address: string
      value: BN | string | number
      channelId?: string
      settlingPeriod?: BN | string | number
    }): Promise<{
      tx: Tx,
      channelId: string
    }> {
    const contractInstance = await this._getContractInstance()
    channelId = channelId || await this._generateChannelId()
    settlingPeriod = new BN(settlingPeriod || DEFAULT_SETTLEMENT_PERIOD)
    if (this.contract.contractName === 'Unidirectional') {
      try {
        const openTx = contractInstance.methods.open(
          channelId,
          address,
          settlingPeriod
        )
        const tx = await this._generateTx(openTx,value)
        return { tx, channelId }
      } catch (err) {
        throw new Error(`Failed to open channel: ${err.message}`)
      }
    } else {
      try {
        const openTx = contractInstance.methods.open(
          channelId,
          address,
          settlingPeriod,
          this.tokenAddress,
          new BN(value).toString()
        )
        const tx = await this._generateTx(openTx)
        return { tx, channelId }
      } catch (err) {
        throw new Error(`Failed to open channel: ${err.message}`)
      }
    }
  }

  async getChannel (channelId: string): Promise<Channel> {
    try {
      const contractInstance = await this._getContractInstance()
      let {
        sender, receiver, settlingUntil, settlingPeriod, value
      } = await contractInstance.methods.channels(channelId).call()
      if (this.web3.utils.toBN(sender).isZero()) {
        throw new Error(`channel not found or already closed`)
      }
      settlingUntil = settlingUntil !== '0'
      ? new BN(settlingUntil)
      : undefined

      return {
        channelId,
        receiver,
        sender,
        settlingUntil,
        settlingPeriod: new BN(settlingPeriod),
        value: new BN(value)
      }
    } catch (err) {
      throw new Error(`Failed to fetch channel details: ${err.message}`)
    }
  }

  async depositToChannelTx (channelId: string, value: BN | string | number): Promise<Tx> {
    try {
      const isPositive = new BN(value).gt(new BN(0))
      if (!isPositive) {
        throw new Error(`can't deposit for 0 or negative amount`)
      }
      const channel = await this.getChannel(channelId)
      const account = this.web3.eth.defaultAccount || this.web3.eth.accounts.wallet[0].address
      const amSender = channel.sender === account
      if (!amSender) {
        throw new Error(`Default account is not the sender`)
      }
      if (channel.settlingUntil) {
        throw new Error(`channel is not open`)
      }
      const contractInstance = await this._getContractInstance()
      if (this.contract.contractName === 'Unidirectional') {
        const depositTx = contractInstance.methods.deposit(channelId)
        return await this._generateTx(depositTx, value)
      } else {
        const depositTx = contractInstance.methods.deposit(channelId, new BN(value).toString())
        return await this._generateTx(depositTx)
      }
    } catch (err) {
      throw new Error(`Failed to deposit: ${err.message}`)
    }
  }

  async createClaim ({ channelId, value }: {
    channelId: string
    value: BN | string | number
  }): Promise<Claim> {
    try {
      const isPositive = new BN(value).gt(new BN(0))
      if (!isPositive) {
        throw new Error(`can't create claim for 0 or negative amount`)
      }
      const channel = await this.getChannel(channelId)
      const account = this.web3.eth.defaultAccount || this.web3.eth.accounts.wallet[0].address
      const amSender = channel.sender === account
      if (!amSender) {
        throw new Error(`Default account is not the sender`)
      }
      if (channel.settlingUntil) {
        throw new Error(`channel is not open`)
      }
      if (new BN(value).gt(channel.value)) {
        throw new Error(`total spend is larger than channel value`)
      }
      const contractInstance = await this._getContractInstance()
      if (this.contract.contractName === 'Unidirectional') {
        const digest = await contractInstance.methods.paymentDigest(channelId, value).call()
        const signature = await this.web3.eth.sign(digest, account)
        return {
          channelId,
          value: new BN(value).toString(),
          signature
        }
      } else {
        const digest = await contractInstance.methods.paymentDigest(channelId, value, this.tokenAddress).call()
        const signature = await this.web3.eth.sign(digest, account)
        return {
          channelId,
          value: new BN(value).toString(),
          signature
        }
      }
    } catch (err) {
      throw new Error(`Failed to create claim: ${err.message}`)
    }
  }

  async validateClaim (claim: Claim): Promise<void> {
    try {
      const channel = await this.getChannel(claim.channelId)
      const account = this.web3.eth.defaultAccount || this.web3.eth.accounts.wallet[0].address
      if (channel.receiver !== account) {
        throw new Error(`default account is not the receiver`)
      }
      const contractInstance = await this._getContractInstance()
      const canClaim = await contractInstance.methods.canClaim(
        claim.channelId,
        claim.value,
        account,
        claim.signature
      ).call()
      if (!canClaim) {
        throw new Error(`not signed by sender of the channel`)
      }

      const isValidClaimValue = new BN(claim.value).lte(channel.value)
      if (!isValidClaimValue) {
        throw new Error(`claim value is greater than amount in channel`)
      }
      const isPositive = new BN(claim.value).gt(new BN(0))
      if (!isPositive) {
        throw new Error(`claim is zero or negative`)
      }
    } catch (err) {
      throw new Error(`Invalid claim: ${err.message}`)
    }
  }

  async closeChannelTx ({ channelId, claim }: {
    channelId: string
    claim?: Claim
  }): Promise<Tx> {
    try {
      const contractInstance = await this._getContractInstance()
      const channel = await this.getChannel(channelId)
      const account = this.web3.eth.defaultAccount || this.web3.eth.accounts.wallet[0].address
      if (channel.receiver === account) {
        try {
          if (!claim) {
            throw new Error(`Cannot claim channel on behalf of receiver: No claim given.`)
          }
          await this.validateClaim(claim)
          const claimTx = contractInstance.methods.claim(
            claim.channelId, claim.value, claim.signature)
          return await this._generateTx(claimTx)
        } catch (err) {
          throw new Error(`Failed to claim: ${err.message}`)
        }
      } else if (channel.sender === account) {
        if (channel.settlingUntil) {
          try {
            const blockNumber = await this.web3.eth.getBlockNumber()
            const blocksRemaining = (channel.settlingUntil as BN).sub(new BN(blockNumber))
            if (blocksRemaining.gt(new BN(0))) {
              throw new Error(`${blocksRemaining.toString()} blocks remaining in settling period`)
            }
            const settleTx = await contractInstance.methods.settle(channelId)
            return await this._generateTx(settleTx)
          } catch (err) {
            throw new Error(`Failed to settle: ${err.message}`)
          }
        } else {
          try {
            const settleTx = await contractInstance.methods.startSettling(channelId)
            return await this._generateTx(settleTx)
          } catch (err) {
            throw new Error(`Failed to start settling: ${err.message}`)
          }
        }

      } else {
        throw new Error(`default account is not the sender nor receiver`)
      }
    } catch (err) {
      throw new Error(`Failed to settle: ${err.message}`)
    }
  }
}

export = Minomy
