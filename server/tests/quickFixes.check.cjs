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
      '../models/Appointment':class {constructor(){throw Error('must not save');}},
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
      '../models/Appointment':class {constructor(){throw Error('must not save');}},
      '../models/Service':{findById:async()=>service},'../models/Provider':{findById:async()=>provider},'../models/User':{},
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
