# minomy

### Simple, functional JavaScript library for Ethereum micropayments

Minomy uses the Ethereum contracts from [Machinomy](https://github.com/machinomy/machinomy) for unidirectional payment channels to send ether and ERC-20 tokens. Whereas Minomy is designed around a minimal API, the Machinomy Node.js library provides more features, such as database integration and web monetization. Choose what's best for your use case!

## Example

```typescript
const Minomy = require('..')
import Web3 = require('web3')
import { BigNumber } from 'bignumber.js'
const Unidirectional = require('@machinomy/contracts/build/contracts/Unidirectional.json')
const TokenUnidirectional = require('@machinomy/contracts/build/contracts/TokenUnidirectional.json')
// Dai is an ERC20 token. This api should work with any ERC20 that implements open-zeppelin StandardToken.
const daiAbi = require(`@makerdao/dai/contracts/abi/erc20Token/v1.json`)
const daiAddress = '0xc4375b7de8af5a38a93548eb8453a498222c4ff2'

async function run (cooperative: boolean) {

  async function checkBlockNumber (blocknum: BigNumber | string | number) {
    const num = await web3.eth.getBlockNumber()
    if (new BigNumber(num).gt(new BigNumber(blocknum))) {
      return
    } else {
      return new Promise(resolve => {
        setTimeout(() => {
          checkBlockNumber(blocknum).then(resolve)
        }, 5000)
      })
    }
  }

  const web3 = new Web3('wss://kovan.infura.io/ws') // api token may be necessary for main net deployments.
  web3.eth.accounts.wallet.add('0x9AC328CF66B124CE9911F077048A079C1EED2F773655BD61AC2226B4E4A554AC')
  web3.eth.accounts.wallet.add('0x992294182FA5612992A67BE8C18A5CEC530B39A2CF61C270268EC65779135B43')
  const minomyErc20 = new Minomy(TokenUnidirectional, web3, daiAddress, daiAbi)
  const minomyEth = new Minomy(Unidirectional, web3)

  // ---------------- ETH payment channel example -----------------
  // Opens a payment channel, deposits additional funds to it, creates and validates a payment, then closes the channel, either cooperatively (receiver closes) or non-cooperatively (sender closes).
  // createOpenChannelTx returns a signed transaction to open a channel and the ChannelId that will be created. It does not send the transaction.
  let { tx: ethTx , channelId: ethChannelId } = await minomyEth.createOpenChannelTx({
    address: '0x3b847AFCbd7AB1ffdB0204A50719B34cD6B04F10', // The address of the receiver (the counterparty we are making payments too)
    value: new BigNumber(100), // Value (in wei) of the channel
    settlingPeriod: new BigNumber(1) // How many blocks before settling. Note, using 1 is only for example purposes so we can claim the channel right away.
  })
  // Send the transaction that creates the channel.
  let openEthChannelTx = await minomyEth.web3.eth.sendTransaction(ethTx)
  console.log(openEthChannelTx)
  console.log(`Created ETH Channel ${ethChannelId} for 100 wei`)
  // Deposit an additional 130 wei to the channel.
  let depositEthTx = await minomyEth.createDepositToChannelTx(ethChannelId, new BigNumber(130))
  let depositEthChannelTx = await minomyEth.web3.eth.sendTransaction(depositEthTx)
  console.log(depositEthChannelTx)
  console.log('Deposited to ETH Channel for 130 wei')
  // Get channel info for the channel we just created
  let ethChannelInfo = await minomyEth.getChannel(ethChannelId)
  console.log(ethChannelInfo)
  // Create a claim (payment) for 10 wei
  let ethClaim = await minomyEth.createClaim({ channelId: ethChannelId, value: new BigNumber(10) })
  console.log(ethClaim)
  console.log(`Created claim for 10 wei in channel ${ethChannelId}`)
  minomyEth.web3.eth.defaultAccount = minomyEth.web3.eth.accounts.wallet[1].address
  // Validate the claim (This is done by the receiver of the payment)
  await minomyEth.validateClaim(ethClaim)
  console.log(`Validated claim for 10 wei in channel ${ethChannelId}`)
  // If there is an uncooperative settle, the sender initiates settlment. The receiver has x blocks to respond an claim the channel, after which the sender can claim the entire channel amount.
  if (!cooperative) {
    minomyEth.web3.eth.defaultAccount = minomyEth.web3.eth.accounts.wallet[0].address
    // Create transaction that initiates settlement by the sender.
    let startSettleEthTx = await minomyEth.createCloseChannelTx({ channelId: ethChannelId, claim: ethClaim })
    let startSettlingTxReceipt = await minomyEth.web3.eth.sendTransaction(startSettleEthTx)
    console.log('Started settling ETH channel on behalf of sender')
    // Wait until the channel can be claimed (one block in this example)
    await checkBlockNumber(startSettlingTxReceipt.blockNumber)
    // Claim the channel as the sender. 
    let claimChannelEthTx = await minomyEth.createCloseChannelTx({ channelId: ethChannelId, claim: ethClaim })
    let claimChannelTxReceipt = await minomyEth.web3.eth.sendTransaction(claimChannelEthTx)
    console.log(claimChannelTxReceipt)
    console.log(`Settled ETH channel on behalf of sender`)
  } else {
    minomyEth.web3.eth.defaultAccount = minomyEth.web3.eth.accounts.wallet[1].address
    // In the cooperative case, the receiver can claim the channel at any time.
    let createCloseChannelTx = await minomyEth.createCloseChannelTx({ channelId: ethChannelId, claim: ethClaim })
    let createCloseChannelTxReceipt = await minomyEth.web3.eth.sendTransaction(createCloseChannelTx)
    console.log(createCloseChannelTxReceipt)
    console.log('Closed channel on behalf of receiver')
  }

  // ---------------- ERC-20 payment channel example -----------------
  // Performs the same operations as ETH example.
  minomyEth.web3.eth.defaultAccount = minomyEth.web3.eth.accounts.wallet[0].address
  // Open erc20 (dai) channel
  // Note that for ERC20s we have to approve the transaction to send money to the Machiomy contract before opening the channel
  let approveTx = await minomyErc20.createApproveTokenTransferTx(new BigNumber(1))
  let approveOpenTx = await minomyErc20.web3.eth.sendTransaction(approveTx)
  console.log(approveOpenTx)
  let { tx: erc20Tx , channelId: erc20ChannelId } = await minomyErc20.createOpenChannelTx({
    address: '0x3b847AFCbd7AB1ffdB0204A50719B34cD6B04F10', // The address of the receiver
    value: new BigNumber(1), // Value of the ERC20 token, in whatever base units that ERC20 used. Most ERC20s, like Ethereum, use wei (10e-18) as the base value
    settlingPeriod: new BigNumber(1) // Number of blocks before the channel can be claimed in the case the sender initiates settlement.
  })
  let openErc20Tx = await minomyErc20.web3.eth.sendTransaction(erc20Tx)
  console.log(openErc20Tx)
  console.log('Created Dai Channel for 1 dai-wei')
  let approveTx2 = await minomyErc20.createApproveTokenTransferTx(new BigNumber(101))
  let aproveDepositTx = await web3.eth.sendTransaction(approveTx2)
  console.log(aproveDepositTx)
  // Deposit additional ERC20 tokens in to the channel, in base units of the token.
  let depositErc20Tx = await minomyErc20.createDepositToChannelTx(erc20ChannelId, new BigNumber(101))
  let sentErcDeposit20Tx = await web3.eth.sendTransaction(depositErc20Tx)
  console.log(sentErcDeposit20Tx)
  console.log('Deposited to Erc20 Channel for 101 dai-wei')
  let erc20ChannelInfo = await minomyErc20.getChannel(erc20ChannelId)
  console.log(erc20ChannelInfo)
  // Create a claim (spend money) from the ERC20 channel.
  let erc20Claim = await minomyErc20.createClaim({ channelId: erc20ChannelId, value: new BigNumber(10) })
  console.log(erc20Claim)
  console.log(`Created claim for 10 dai-wei in channel ${erc20ChannelId}`)
  web3.eth.defaultAccount = web3.eth.accounts.wallet[1].address
  const receiverErc20Minomy = new Minomy(TokenUnidirectional, web3, daiAddress, daiAbi)
  // Validate the claim. This is done by the reicever.
  await receiverErc20Minomy.validateClaim(erc20Claim)
  console.log(`Validated claim for 10 wei in channel ${erc20ChannelId}`)
  if (!cooperative) {
    // In the uncooperative case, the sender initiates settlemnt and claims the channel after the settlementPeriod delay.
    web3.eth.defaultAccount = web3.eth.accounts.wallet[0].address
    let startSettleErc20Tx = await minomyErc20.createCloseChannelTx({ channelId: erc20ChannelId, claim: erc20Claim })
    let startSettlingErc20TxReceipt = await web3.eth.sendTransaction(startSettleErc20Tx)
    console.log('Started settling ERC20 channel on behalf of sender')
    await checkBlockNumber(startSettlingErc20TxReceipt.blockNumber)
    let claimChannelErc20Tx = await minomyErc20.createCloseChannelTx({ channelId: erc20ChannelId, claim: erc20Claim })
    let claimChannelErc20TxReceipt = await web3.eth.sendTransaction(claimChannelErc20Tx)
    console.log(claimChannelErc20TxReceipt)
    console.log(`Settled ERC20 channel on behalf of sender`)
  } else {
    // The receiver can claim the channel at any time, with no delay.
    let closeErc20Tx = await receiverErc20Minomy.createCloseChannelTx({ channelId: erc20ChannelId, claim: erc20Claim })
    let closeErc20 = await web3.eth.sendTransaction(closeErc20Tx)
    console.log(closeErc20.transactionHash)
    console.log(`Closed erc20 channel on behalf of the receiver`)
  }
}
run(true).catch(err => console.error(err))
.then(() => run(false).catch(err => console.error(err)))
.then(() => process.exit())
```
