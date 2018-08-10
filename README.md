# Minomy

### Simple, functional JavaScript library for Ethereum micropayments

Minomy uses the Ethereum contracts from [Machinomy](https://github.com/machinomy/machinomy) for unidirectional payment channels to send ether (and soon!) ERC-20 tokens. Whereas Minomy is designed around a minimal and stateless API, the Machinomy Node.js library provides more features, such as database integration and web monetization. Choose what's best for your use case!

### Example

```typescript
import * as Minomy from '.'
import Web3 = require('web3')
import BigNumber from 'bignumber.js'

async function run () {
  // Setup the sender
  // If there's no default account set, Minomy uses the first account in wallet
  const web3 = new Web3('wss://ropsten.infura.io/ws')
  web3.eth.accounts.wallet.add('SENDER_PRIVATE_KEY')

  // Setup the receiver
  const receiver = web3.eth.accounts.wallet.add('RECEIVER_PRIVATE_KEY').address

  // Create channel for 130 wei from sender to receiver
  let { tx, channelId } = await Minomy.openChannel(web3, {
    address: receiver,
    value: new BigNumber(130)
  })
  await web3.eth.sendTransaction(tx)

  // Deposit 50 wei to channel, new total value of 180 wei
  tx = await Minomy.depositToChannel(web3, { channelId, value: new BigNumber(50) })
  await web3.eth.sendTransaction(tx)

  // Create payment for 150 wei
  const payment = await Minomy.createPayment(web3, { channelId, value: new BigNumber(150) })

  // Set receiver as default account so Web3 and Minomy use that
  web3.eth.defaultAccount = receiver

  // Confirm the payment is valid (throws if invalid)
  await Minomy.validatePayment(web3, payment)

  // Claim the channel
  tx = await Minomy.closeChannel(web3, { channelId, payment })
  await web3.eth.sendTransaction(tx)
}

run().catch(err => console.error(err))
```
