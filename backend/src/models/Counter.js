const { Schema, model } = require('mongoose');

const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = model('Counter', CounterSchema);

async function nextSeq(key) {
  const c = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}

module.exports = { Counter, nextSeq };
