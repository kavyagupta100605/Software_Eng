const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, env = {}) {
  const filename = path.join(root, file);
  const module = { exports: {} };
  const actual = createRequire(filename);
  if (file === 'controllers/appointmentController.js') {
    mocks = {
      '../services/slotHolds': { checkHolds: async () => null, releaseHold: async () => {} },
      '../services/waitlist': {
        lockSchedule: mocks['../models/Provider']?.findById,
        claimableOffer: async () => null,
        advanceWaitlist: async () => {}
      },
      ...mocks
    };
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: id => id in mocks ? mocks[id] : actual(id),
    process: { env }, console, Date
  }, { filename });
  return module.exports;
}
function response() { return { code: 200, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } }; }
test('JWT secret is required, configured secret is retained', () => {
  assert.throws(() => load('middleware/auth.js'), /JWT_SECRET is required/);
  assert.throws(() => load('middleware/auth.js', {}, {JWT_SECRET:'   '}), /JWT_SECRET/);
  assert.equal(load('middleware/auth.js', {}, {JWT_SECRET:'test-only-secret'}).JWT_SECRET, 'test-only-secret');
});
test('database missing URI or connection failure rejects without fallback', async () => {
  let calls=0;
  const connect = load('config/db.js', {mongoose:{connect:async()=>{calls++;throw Error('offline');}}});
  await assert.rejects(connect, /MONGODB_URI/); assert.equal(calls,0);
  const failing = load('config/db.js', {mongoose:{connect:async()=>{calls++;throw Error('offline');}}}, {MONGODB_URI:'mongodb://example/test'});
  await assert.rejects(failing,/offline/); assert.equal(calls,1);
});
test('production seeding exits before any database writes', async () => {
  const fail = new Proxy({}, {get(){throw Error('database accessed');}});
  const seed = load('config/seedData.js', {'../models/User':fail,'../models/Provider':fail,'../models/Service':fail,'../models/Availability':fail}, {NODE_ENV:'production'});
  await seed();
});
function engine(provider, service, appointments=[]) {
  const queries=[];
  const availability={weeklyHours:[{dayOfWeek:1,startTime:'09:00',endTime:'12:00'}],blockedRanges:[]};
  return { queries, api:load('services/availabilityEngine.js', {
    '../models/Provider':{findById:async()=>provider},
    '../models/Service':{findById:async()=>service},
    '../models/Availability':{findOne:async()=>availability},
    '../models/Appointment':{find:query=>{queries.push(query);return {lean:async()=>appointments};},findOne:async query=>{queries.push(query);return null;}}
  })};
}
const provider={isApproved:true,bufferMinutes:0};
const service={providerId:'p',isActive:true,durationMins:60};
test('slots reject foreign services and pending providers with 404', async () => {
  await assert.rejects(engine(provider,{...service,providerId:'other'}).api.getAvailableSlots('p','s','2030-01-07','2030-01-07'), e=>e.statusCode===404);
  await assert.rejects(engine({...provider,isApproved:false},service).api.getAvailableSlots('p','s','2030-01-07','2030-01-07'), e=>e.statusCode===404);
});
test('zero buffer generates back-to-back slots, mixed-service booking respects buffer', async () => {
  const date = new Date(2030,0,7);
  const zero = engine(provider,service);
  const slots=await zero.api.getAvailableSlots('p','s',date,date);
  assert.equal(slots.length,3);
  assert.equal(new Date(slots[1].slotStart).getHours(),10);
  const buffered=engine({...provider,bufferMinutes:15},{...service,durationMins:30},[{slotStart:new Date(2030,0,7,10),slotEnd:new Date(2030,0,7,11)}]);
  const available=await buffered.api.getAvailableSlots('p','s',date,date);
  assert(!available.some(s=>new Date(s.slotStart).getHours()===9 && new Date(s.slotStart).getMinutes()===45));
  const start=new Date(2030,0,7,11,5), end=new Date(2030,0,7,11,35);
  await buffered.api.checkSlotConflict('p',start,end);
  const query=buffered.queries.at(-1);
  assert.equal(query.slotStart.$lt.getTime(),end.getTime()+15*60000);
  assert.equal(query.slotEnd.$gt.getTime(),start.getTime()-15*60000);
});
test('booking rejects foreign service and revoked provider before save', async () => {
  for (const [svc,prov] of [[{...service,providerId:'other'},provider],[service,{...provider,isApproved:false}]]) {
    const controller=load('controllers/appointmentController.js', {
      '../models/Appointment':class {
      static db = { transaction: async run => run({}) };
      constructor(){throw Error('must not save');}
    },
      '../models/Service':{findById:async()=>svc},'../models/Provider':{findById:async()=>prov},'../models/User':{},
      '../services/availabilityEngine':{},'../services/notifyService':{}
    });
    const res=response();
    await controller.createAppointment({body:{providerId:'p',serviceId:'s',slotStart:'2030-01-07T09:00:00Z'},user:{id:'c'}},res,e=>{throw e;});
    assert.equal(res.code,404);
  }
});
test('update validators reject negative, fractional, oversized and malformed values; allow partial valid updates', async () => {
  const validators=require('../validators/providerValidator');
  const id='507f1f77bcf86cd799439011';
  const cases=[['updateProviderValidation',{bufferMinutes:-1},false],['updateProviderValidation',{cancellationWindowHours:-1},false],['updateProviderValidation',{bufferMinutes:0},true],['updateProviderValidation',{bufferMinutes:1441},false],['updateProviderValidation',{businessName:'   '},false],['updateServiceValidation',{price:-1},false],['updateServiceValidation',{durationMins:5.5},false],['updateServiceValidation',{durationMins:1441},false],['updateServiceValidation',{price:0,durationMins:30},true]];
  for (const [name,body,valid] of cases) {
    const res=response();let next=false;
    await validators[name]({body,params:{id},query:{},headers:{}},res,()=>{next=true;});
    assert.equal(next,valid,JSON.stringify(body)); if(!valid) assert.equal(res.code,400);
  }
});
test('booking rejects past times and unavailable opening-hour/grid slots', async () => {
  for (const slotStart of ['2020-01-07T09:00:00Z','2030-01-06T03:00:00Z']) {
    const controller=load('controllers/appointmentController.js', {
      '../models/Appointment':class {
      static db = { transaction: async run => run({}) };
      constructor(){throw Error('must not save');}
    },
      '../models/Service':{findById:()=>Object.assign(Promise.resolve(service), { session:async()=>service })},'../models/Provider':{findById:async()=>provider},'../models/User':{},
      '../services/availabilityEngine':{getAvailableSlots:async()=>[],checkSlotConflict:async()=>{throw Error('must reject first');}},'../services/notifyService':{}
    });
    const res=response();
    await controller.createAppointment({body:{providerId:'p',serviceId:'s',slotStart},user:{id:'c'}},res,e=>{throw e;});
    assert.equal(res.code,400);assert.equal(res.body.error.code,'INVALID_SLOT');
  }
});
test('pending providers can still manage existing schedules and own services', async () => {
  const pending={...provider,isApproved:false,userId:'owner',_id:'p'};
  const chain={populate(){return this;},sort(){return this;},lean:async()=>[]};
  const controllers=load('controllers/appointmentController.js',{
    '../models/Provider':{findById:async()=>pending},'../models/Service':{},'../models/User':{},
    '../models/Appointment':{find:()=>chain},'../services/availabilityEngine':{},'../services/notifyService':{}
  });
  const res=response();
  await controllers.getProviderAppointments({params:{id:'p'},query:{},user:{id:'owner',role:'provider'}},res,e=>{throw e;});
  assert.equal(res.code,200);
  const services=load('controllers/serviceController.js',{'../models/Provider':{findById:async()=>pending},'../models/Service':{find:()=>chain}});
  for (const [user,expected] of [[undefined,404],[{id:'owner',role:'provider'},200],[{id:'admin',role:'admin'},200]]) {
    const responseObject=response();await services.getProviderServices({params:{id:'p'},user},responseObject,e=>{throw e;});assert.equal(responseObject.code,expected);
  }
});

test('wallet top-up, booking, reminder and cancellation emails have the intended contents', async () => {
  const messages = [];
  const mail = load('services/notifyService.js', {
    nodemailer: {},
    '../jobs/emailOutbox': { enqueueEmail: async (message) => { messages.push(message); } }
  });
  const client = { clientEmail: 'client@example.test', clientName: 'Client' };
  const booking = { providerName: 'Provider', serviceName: 'Consultation', slotStart: '2030-01-07T09:00:00Z' };
  await mail.sendWalletTopUpEmail({ ...client, amountCents: 5000, balanceCents: 6500 });
  await mail.sendBookingConfirmation({ ...client, ...booking, paidCents: 1500, balanceCents: 5000 });
  await mail.sendReminderEmail({ ...client, ...booking });
  await mail.sendBookingCancellation({ ...booking, email: 'provider@example.test' });

  assert.deepEqual(messages.map(message => message.to), [
    client.clientEmail, client.clientEmail, client.clientEmail, 'provider@example.test'
  ]);
  assert.match(messages[0].text, /Demo funds added: \$50\.00[\s\S]*\$65\.00/);
  assert.match(messages[1].text, /Demo wallet payment: \$15\.00[\s\S]*\$50\.00/);
  assert.match(messages[2].subject, /Reminder/);
  assert.match(messages[3].subject, /Appointment cancelled/);
});

test('reminder job retries a failed send and marks a successful send', async () => {
  let run;
  let shouldFail = true;
  let saves = 0;
  const appointment = {
    clientId: { email: 'client@example.test' },
    slotStart: new Date(Date.now() + 60_000),
    reminderSent: false,
    _id: 'appointment'
  };
  const query = {
    populate() { return this; },
    then(resolve) { resolve([appointment]); }
  };
  const cron = load('jobs/reminderCron.js', {
    'node-cron': { schedule: (schedule, callback) => { assert.equal(schedule, '*/15 * * * *'); run = callback; } },
    '../models/Appointment': {
      find: filter => { assert(filter.slotStart.$gt < appointment.slotStart); return query; },
      updateOne: async (_filter, update) => { Object.assign(appointment, update.$set); saves++; }
    },
    '../services/notifyService': {
      sendReminderEmail: async () => { if (shouldFail) throw Error('Simulated transport failure'); }
    }
  });
  cron();
  await run();
  assert.equal(appointment.reminderSent, false);
  assert.equal(saves, 0);
  shouldFail = false;
  await run();
  assert.equal(appointment.reminderSent, true);
  assert.equal(saves, 1);
});

test('wallet booking queues its receipt in the same transaction as the debit', async () => {
  const session = {};
  const pricedService = { ...service, name: 'Consultation', price: 15 };
  const slotStart = '2030-01-07T09:00:00Z';
  const receipts = [];
  const saved = [];
  let balance = 5000;
  let committed = false;

  class Appointment {
    static db = { transaction: async reserve => {
      committed = false;
      const result = await reserve(session);
      committed = true;
      return result;
    } };
    constructor(values) { Object.assign(this, values); }
    async save(options) { assert.equal(options.session, session); saved.push(this); }
  }

  const controller = load('controllers/appointmentController.js', {
    '../models/Appointment': Appointment,
    '../models/Service': { findById: () => Object.assign(Promise.resolve(pricedService), {
      session: async value => { assert.equal(value, session); return pricedService; }
    }) },
    '../models/Provider': {
      findById: async () => provider,
      updateOne: async (filter, update, options) => { assert.equal(options.session, session); }
    },
    '../models/User': {
      findOneAndUpdate: async (filter, update, options) => {
        assert.equal(options.session, session);
        if (balance < filter.walletBalanceCents.$gte) return null;
        balance += update.$inc.walletBalanceCents;
        return { email: 'client@example.test', walletBalanceCents: balance };
      }
    },
    '../services/availabilityEngine': {
      getAvailableSlots: async (_provider, _service, _start, _end, value) => {
        assert.equal(value, session);
        return [{ slotStart, slotEnd: '2030-01-07T10:00:00Z' }];
      },
      checkSlotConflict: async () => ({ hasConflict: false })
    },
    '../services/notifyService': { sendBookingConfirmation: async receipt => {
      assert(!committed);
      assert.equal(receipt.session, session);
      receipts.push(receipt);
    } }
  });
  const req = {
    body: { providerId: 'p', serviceId: 's', slotStart, paymentMethod: 'demo_wallet', expectedPriceCents: 1500 },
    user: { id: 'client' }
  };
  const success = response();
  await controller.createAppointment(req, success, error => { throw error; });
  assert.equal(success.code, 201);
  assert.equal(success.body.data.walletBalanceCents, 3500);
  assert.equal(saved[0].walletPaidCents, 1500);
  assert.equal(receipts[0].balanceCents, 3500);
  balance = 100;
  const failure = response();
  await controller.createAppointment(req, failure, error => { throw error; });
  assert.equal(failure.body.error.code, 'INSUFFICIENT_WALLET_BALANCE');
  assert.equal(saved.length, 1);
  assert.equal(receipts.length, 1);
});

test('wallet top-up emails only after a valid credit', async () => {
  let topUp;
  const receipts = [];
  const router = { use() {}, get() {}, post(_path, handler) { topUp = handler; } };
  load('routes/v1/walletRoutes.js', {
    express: { Router: () => router },
    '../../middleware/auth': {},
    '../../middleware/role': () => {},
    '../../models/User': {
      db: { transaction: async run => run({}) },
      findByIdAndUpdate: (_id, change) => ({
        select: async () => ({
          name: 'Client', email: 'client@example.test',
          walletBalanceCents: 500 + change.$inc.walletBalanceCents
        })
      })
    },
    '../../services/notifyService': {
      sendWalletTopUpEmail: async receipt => { receipts.push(receipt); }
    }
  });
  const invalid = response();
  await topUp({ body: { amountCents: -100 }, user: { id: 'client' } }, invalid, error => { throw error; });
  assert.equal(invalid.code, 400);
  assert.equal(receipts.length, 0);
  const valid = response();
  await topUp({ body: { amountCents: 1500 }, user: { id: 'client' } }, valid, error => { throw error; });
  assert.equal(valid.body.data.balanceCents, 2000);
  assert.equal(receipts[0].clientEmail, 'client@example.test');
  assert.equal(receipts[0].balanceCents, 2000);
});

test('both cancellation endpoints email the client and provider only on a saved cancellation', async () => {
  const sentTo = [];
  let persistedStatus = 'confirmed';
  const controller = load('controllers/appointmentController.js', {
    '../models/Appointment': {
      db: { transaction: async run => run({}) },
      findById: async () => ({
        _id: 'a', clientId: 'client', providerId: 'p', serviceId: 's',
        slotStart: new Date('2030-01-07T09:00:00Z'), status: persistedStatus
      }),
      updateOne: async (filter, update) => {
        assert.equal(filter.status, persistedStatus);
        persistedStatus = update.$set.status;
        return { modifiedCount: 1 };
      }
    },
    '../models/Service': { findById: async () => ({ name: 'Consultation' }) },
    '../models/Provider': { findById: async () => ({ userId: 'owner', cancellationWindowHours: 2 }) },
    '../models/User': { findById: async id => ({ email: `${id}@example.test` }) },
    '../services/availabilityEngine': {},
    '../services/notifyService': {
      sendBookingCancellation: async ({ email }) => {
        assert.equal(persistedStatus, 'cancelled');
        sentTo.push(email);
      }
    }
  });

  for (const [handler, actor] of [['cancelAppointment', 'client'], ['updateAppointmentStatus', 'owner']]) {
    persistedStatus = 'confirmed';
    const req = { params: { id: 'a' }, body: { status: 'cancelled' }, user: { id: actor } };
    const result = response();
    await controller[handler](req, result, error => { throw error; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.code, 200);
    const duplicate = response();
    await controller[handler](req, duplicate, error => { throw error; });
    assert.equal(duplicate.code, 400);
  }
  assert.deepEqual(sentTo, ['client@example.test', 'owner@example.test', 'client@example.test', 'owner@example.test']);
});

test('wallet refunds use exact time boundaries and round down to cents', () => {
  const refund = require('../services/walletRefund');
  const start = new Date('2030-01-07T09:00:00Z');
  for (const [minutes, percent, amountCents] of [
    [180, 100, 1001], [179, 75, 750], [120, 75, 750],
    [119, 50, 500], [60, 50, 500], [59, 25, 250], [0, 0, 0], [-1, 0, 0]
  ]) {
    assert.deepEqual(refund(1001, start, new Date(+start - minutes * 60_000), 'client'), {
      percent, amountCents, status: percent ? 'credited' : 'not_due'
    });
  }
  assert.equal(refund(1001, start, new Date(+start - 1), 'provider').amountCents, 1001);
  assert.equal(refund(1001, start, start, 'provider').amountCents, 0);
});

test('wallet cancellation credits the original payment at most once and queues the refund email atomically', async () => {
  const session = {};
  const notifications = [];
  const initialBalance = 150;
  let balance;
  let stored;
  let committed;
  const controllers = load('controllers/appointmentController.js', {
    '../models/Appointment': {
      findById: async () => ({ ...stored }),
      updateOne: async (filter, update, options) => {
        assert.equal(options.session, session);
        if (filter.status !== stored.status) return { modifiedCount: 0 };
        Object.assign(stored, update.$set);
        return { modifiedCount: 1 };
      },
      db: { transaction: async run => {
        const value = await run(session);
        committed = true;
        return value;
      } }
    },
    '../models/Provider': {
      findById: async () => ({ userId: 'owner', cancellationWindowHours: 2 })
    },
    '../models/Service': { findById: async () => ({ name: 'Consultation', price: 50 }) },
    '../models/User': {
      findByIdAndUpdate: async (id, update, options) => {
        assert.equal(id, 'client');
        assert.equal(options.session, session);
        balance += update.$inc.walletBalanceCents;
        return { walletBalanceCents: balance };
      },
      findById: async id => ({ email: `${id}@example.test` })
    },
    '../services/availabilityEngine': {},
    '../services/notifyService': {
      sendBookingCancellation: async message => {
        assert(!committed);
        assert.equal(message.session, session);
        notifications.push(message);
      }
    }
  });

  for (const [handler, id, expected] of [
    ['cancelAppointment', 'client', 250],
    ['updateAppointmentStatus', 'owner', 1000]
  ]) {
    notifications.length = 0;
    balance = initialBalance;
    committed = false;
    stored = {
      _id: 'a', clientId: 'client', providerId: 'p', serviceId: 's',
      slotStart: new Date(Date.now() + 15 * 60_000), status: 'confirmed', walletPaidCents: 1000
    };
    const req = { params: { id: 'a' }, body: { status: 'cancelled' }, user: { id } };
    const result = response();
    await controllers[handler](req, result, error => { throw error; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.code, 200);
    assert.equal(stored.walletRefund.amountCents, expected);
    assert.equal(balance, initialBalance + expected);
    assert.equal(notifications[0].walletRefund.amountCents, expected);
    assert.equal(notifications[0].balanceCents, balance);
    assert.equal(notifications[1].walletRefund, undefined);
    const duplicate = response();
    await controllers[handler](req, duplicate, error => { throw error; });
    assert.equal(duplicate.code, 400);
    assert.equal(balance, initialBalance + expected);
  }
});

test('slot discovery keeps booked slots visible when requested', async () => {
  const day = new Date(2030, 0, 7);
  const start = new Date(2030, 0, 7, 9);
  const appointment = { slotStart: start, slotEnd: new Date(2030, 0, 7, 10) };
  const { api } = engine(provider, service, [appointment]);
  const shown = await api.getAvailableSlots('p', 's', day, day, undefined, true);
  assert.equal(shown.find(slot => slot.slotStart === start.toISOString()).available, false);
  const bookable = await api.getAvailableSlots('p', 's', day, day);
  assert(!bookable.some(slot => slot.slotStart === start.toISOString()));
});

test('waitlist moves to the next client after expiry and reserves the slot for the offer holder', async () => {
  const now = Date.now();
  const slotStart = new Date(now + 24 * 60 * 60_000);
  const slotEnd = new Date(+slotStart + 30 * 60_000);
  const session = {};
  const emails = [];
  const candidate = { slotStart: slotStart.toISOString(), slotEnd: slotEnd.toISOString(), available: true };
  let occupied = true;
  const rows = ['first', 'second'].map((clientId, index) => ({
    _id: clientId, providerId: 'p', serviceId: 's', clientId,
    slotStart, slotEnd, status: 'waiting', createdAt: new Date(now + index),
    save: async ({ session: writeSession }) => { assert.equal(writeSession, session); }
  }));

  function matches(row, filter) {
    if (filter._id) return row._id === filter._id;
    if (filter.$or) return row.status === 'waiting'
      || (row.status === 'offered' && row.offerExpiresAt > filter.$or[1].offerExpiresAt.$gt);
    if (filter.status?.$in) return filter.status.$in.includes(row.status);
    return row.status === 'offered' && row.offerExpiresAt > filter.offerExpiresAt.$gt && !row.notifiedAt;
  }

  const waitlist = load('services/waitlist.js', {
    '../models/WaitlistEntry': {
      exists: async () => true,
      db: { transaction: async run => run(session) },
      updateMany: async (filter, update) => {
        const cutoff = filter.$or[1].offerExpiresAt.$lte;
        rows.filter(row => row.status === 'offered' && row.offerExpiresAt <= cutoff)
          .forEach(row => Object.assign(row, update.$set));
      },
      updateOne: async (filter, update) => Object.assign(rows.find(row => matches(row, filter)), update.$set),
      find(filter) {
        const result = () => rows.filter(row => matches(row, filter));
        const query = {
          sort(order) { assert.equal(order.createdAt, 1); return this; },
          session: async () => result(),
          populate() { return this; },
          then(resolve) { resolve(result()); }
        };
        return query;
      }
    },
    '../models/Provider': {
      findByIdAndUpdate: async (_id, _update, options) => {
        assert.equal(options.session, session);
        return { isApproved: true, bufferMinutes: 0 };
      }
    },
    '../models/User': { findById: id => ({ select: async () => ({ email: id }) }) },
    './availabilityEngine': { getAvailableSlots: async () => [{ ...candidate, available: !occupied }] },
    './notifyService': { sendWaitlistOffer: async email => { emails.push(email); } }
  });

  await waitlist.advanceWaitlist('p');
  assert.deepEqual(emails, []);
  occupied = false;
  await waitlist.advanceWaitlist('p');
  assert.equal(rows[0].status, 'offered');
  assert.equal(rows[1].status, 'waiting');
  assert.deepEqual(emails, ['first']);
  assert.equal(waitlist.describeSlot(candidate, rows, 's', 'first', 0).status, 'offered');
  assert.equal(waitlist.describeSlot(candidate, rows, 's', 'second', 0).status, 'waiting');
  assert.equal(waitlist.describeSlot(candidate, rows, 's', 'stranger', 0).available, false);

  const booking = { providerId: 'p', serviceId: 's', start: slotStart, end: slotEnd, bufferMs: 0, session };
  await assert.rejects(waitlist.claimableOffer({ ...booking, clientId: 'second' }), { code: 'WAITLIST_PRIORITY' });
  assert.equal(await waitlist.claimableOffer({ ...booking, clientId: 'first' }), rows[0]);
  rows[0].offerExpiresAt = new Date(now - 1);
  await waitlist.advanceWaitlist('p');
  assert.equal(rows[0].status, 'expired');
  assert.equal(rows[1].status, 'offered');
  assert.deepEqual(emails, ['first', 'second']);
  await assert.rejects(waitlist.claimableOffer({ ...booking, clientId: 'first' }), { code: 'WAITLIST_PRIORITY' });
  assert.equal(await waitlist.claimableOffer({ ...booking, clientId: 'second' }), rows[1]);
});

test('waitlist joining accepts booked times and keeps a repeated join in the same position', async () => {
  const start = new Date(Date.now() + 86_400_000);
  const slot = { slotStart: start.toISOString(), slotEnd: new Date(+start + 30 * 60_000).toISOString() };
  const session = {};
  let available = false;
  let writes = 0;
  let entry;
  const waitlist = load('services/waitlist.js', {
    '../models/Provider': { findByIdAndUpdate: async () => ({ isApproved: true }) },
    '../models/User': {},
    '../models/WaitlistEntry': {
      db: { transaction: run => run(session) },
      findOne: () => ({ session: async () => entry }),
      findOneAndUpdate: async (key, update, options) => {
        assert.equal(options.session, session);
        assert.equal(key.clientId, 'client');
        entry = { ...key, ...update.$set };
        writes++;
      }
    },
    './availabilityEngine': {
      getAvailableSlots: async (_provider, _service, _from, _to, _session, includeBooked) => {
        assert.equal(includeBooked, true);
        return [{ ...slot, available }];
      }
    },
    './notifyService': {}
  });
  await waitlist.joinWaitlist('p', 's', 'client', start);
  await waitlist.joinWaitlist('p', 's', 'client', start);
  assert.equal(writes, 1);
  assert.equal(entry.status, 'waiting');
  available = true;
  await assert.rejects(waitlist.joinWaitlist('p', 's', 'other', start), { code: 'WAITLIST_SLOT_NOT_BOOKED' });
});

test('provider schedule rejects overlapping shifts and represents DST gaps explicitly', () => {
  const { normalizeHours, parseLocalDateTime } = require('../services/scheduleTime');
  const morning = { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' };
  const afternoon = { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' };
  assert.deepEqual(normalizeHours([afternoon, morning]), [morning, afternoon]);
  assert.equal(normalizeHours([morning, { ...afternoon, startTime: '11:30' }]), null);
  assert.equal(parseLocalDateTime('2030-01-07T09:00', 'Asia/Kolkata').toISOString(), '2030-01-07T03:30:00.000Z');
  assert.equal(parseLocalDateTime('2030-03-10T02:30', 'America/New_York'), null);
  assert.equal(parseLocalDateTime('2030-11-03T01:30', 'America/New_York').toISOString(), '2030-11-03T05:30:00.000Z');
});
