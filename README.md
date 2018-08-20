# minomy

### Simple, functional JavaScript library for Ethereum micropayments

Minomy uses the Ethereum contracts from [Machinomy](https://github.com/machinomy/machinomy) for unidirectional payment channels to send ether and ERC-20 tokens. Whereas Minomy is designed around a minimal API, the Machinomy Node.js library provides more features, such as database integration and web monetization. Choose what's best for your use case!

## Example

```typescript
import Minomy = require('..')
import Web3 = require('web3')
import BN = require('bn.js')
const Unidirectional = require('@machinomy/contracts/build/contracts/Unidirectional.json')
const TokenUnidirectional = require('@machinomy/contracts/build/contracts/TokenUnidirectional.json')
const daiAbi = require(`@makerdao/dai/contracts/abi/erc20Token/v1.json`)
const daiAddress = '0xc4375b7de8af5a38a93548eb8453a498222c4ff2'

async function run (cooperative: boolean) {

  async function checkBlockNumber (blocknum: BN | string | number) {
    const num = await web3.eth.getBlockNumber()
    if (new BN(num).gt(new BN(blocknum))) {
      return
    } else {
      return new Promise(resolve => {
        setTimeout(() => {
          checkBlockNumber(blocknum).then(resolve)
        }, 5000)
      })
    }
  }

  const web3 = new Web3('wss://kovan.infura.io/ws')
  web3.eth.accounts.wallet.add('0x9AC328CF66B124CE9911F077048A079C1EED2F773655BD61AC2226B4E4A554AC')
  web3.eth.accounts.wallet.add('0x992294182FA5612992A67BE8C18A5CEC530B39A2CF61C270268EC65779135B43')
  const minomyErc20 = new Minomy(TokenUnidirectional, web3, daiAddress, daiAbi)
  const minomyEth = new Minomy(Unidirectional, web3)

  // Open eth channel
  let { tx: ethTx , channelId: ethChannelId } = await minomyEth.openChannelTx({
    address: '0x3b847AFCbd7AB1ffdB0204A50719B34cD6B04F10',
    value: new BN(100),
    settlingPeriod: new BN(1)
  })
  await web3.eth.sendTransaction(ethTx)
  .then(console.log)
  console.log(`Created ETH Channel ${ethChannelId} for 100 wei`)
  let depositEthTx = await minomyEth.depositToChannelTx(ethChannelId, new BN(130))
  await web3.eth.sendTransaction(depositEthTx)
  .then(console.log)
  console.log('Deposited to ETH Channel for 130 wei')
  // Get channel info
  await minomyEth.getChannel(ethChannelId)
  .then(console.log)
  let ethClaim = await minomyEth.createClaim({ channelId: ethChannelId, value: new BN(10) })
  console.log(ethClaim)
  console.log(`Created claim for 10 wei in channel ${ethChannelId}`)
  web3.eth.defaultAccount = web3.eth.accounts.wallet[1].address
  const receiverEthMinomy = new Minomy(Unidirectional, web3)
  await receiverEthMinomy.validateClaim(ethClaim).then(console.log)
  console.log(`Validated claim for 10 wei in channel ${ethChannelId}`)
  if (!cooperative) {
    web3.eth.defaultAccount = web3.eth.accounts.wallet[0].address
    let startSettleEthTx = await minomyEth.closeChannelTx({ channelId: ethChannelId, claim: ethClaim })
    let startSettlingTxReceipt = await web3.eth.sendTransaction(startSettleEthTx)
    console.log('Started settling ETH channel on behalf of sender')
    await checkBlockNumber(startSettlingTxReceipt.blockNumber)
    let claimChannelEthTx = await minomyEth.closeChannelTx({ channelId: ethChannelId, claim: ethClaim })
    let claimChannelTxReceipt = await web3.eth.sendTransaction(claimChannelEthTx)
    console.log(claimChannelTxReceipt)
    console.log(`Settled ETH channel on behalf of sender`)
  } else {
    let closeChannelTx = await receiverEthMinomy.closeChannelTx({ channelId: ethChannelId, claim: ethClaim })
    let closeChannelTxReceipt = await web3.eth.sendTransaction(closeChannelTx)
    console.log(closeChannelTxReceipt)
    console.log('Closed channel on behalf of receiver')
  }

  web3.eth.defaultAccount = web3.eth.accounts.wallet[0].address
  // // Open erc20 (dai) channe
  let approveTx = await minomyErc20.approveTokenTransferTx(new BN(1))
  await web3.eth.sendTransaction(approveTx)
  .then(console.log)
  let { tx: erc20Tx , channelId: erc20ChannelId } = await minomyErc20.openChannelTx({
    address: '0x3b847AFCbd7AB1ffdB0204A50719B34cD6B04F10',
    value: new BN(1),
    settlingPeriod: new BN(1)
  })
  await web3.eth.sendTransaction(erc20Tx)
  .then(console.log)
  console.log('Created Dai Channel for 1 dai-wei')
  let approveTx2 = await minomyErc20.approveTokenTransferTx(new BN(101))
  await web3.eth.sendTransaction(approveTx2)
  .then(console.log)
  let depositErc20Tx = await minomyErc20.depositToChannelTx(erc20ChannelId, new BN(101))
  await web3.eth.sendTransaction(depositErc20Tx)
  .then(console.log)
  console.log('Deposited to Erc20 Channel for 101 dai-wei')
  await minomyErc20.getChannel(erc20ChannelId)
  .then(console.log)
  let erc20Claim = await minomyErc20.createClaim({ channelId: erc20ChannelId, value: new BN(10) })
  console.log(erc20Claim)
  console.log(`Created claim for 10 dai-wei in channel ${erc20ChannelId}`)
  web3.eth.defaultAccount = web3.eth.accounts.wallet[1].address
  const receiverErc20Minomy = new Minomy(TokenUnidirectional, web3, daiAddress, daiAbi)
  await receiverErc20Minomy.validateClaim(erc20Claim).then(console.log)
  console.log(`Validated claim for 10 wei in channel ${erc20ChannelId}`)
  if (!cooperative) {
    web3.eth.defaultAccount = web3.eth.accounts.wallet[0].address
    let startSettleErc20Tx = await minomyErc20.closeChannelTx({ channelId: erc20ChannelId, claim: erc20Claim })
    let startSettlingErc20TxReceipt = await web3.eth.sendTransaction(startSettleErc20Tx)
    console.log('Started settling ERC20 channel on behalf of sender')
    await checkBlockNumber(startSettlingErc20TxReceipt.blockNumber)
    let claimChannelErc20Tx = await minomyErc20.closeChannelTx({ channelId: erc20ChannelId, claim: erc20Claim })
    let claimChannelErc20TxReceipt = await web3.eth.sendTransaction(claimChannelErc20Tx)
    console.log(claimChannelErc20TxReceipt)
    console.log(`Settled ERC20 channel on behalf of sender`)
  } else {
    let closeErc20Tx = await receiverErc20Minomy.closeChannelTx({ channelId: erc20ChannelId, claim: erc20Claim })
    let closeErc20 = await web3.eth.sendTransaction(closeErc20Tx)
    console.log(closeErc20.transactionHash)
    console.log(`Closed erc20 channel on behalf of the receiver`)
  }
}
run(true).catch(err => console.error(err))
.then(() => run(false).catch(err => console.error(err)))
.then(() => process.exit())
```
