const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Provider = require('../models/Provider');
const Service = require('../models/Service');
const Availability = require('../models/Availability');

async function seedDemoData() {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Database already populated. Skipping demo seed.');
      return;
    }

    console.log('Seeding initial demo data...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    // Create Demo Admin
    const admin = new User({
      name: 'System Admin',
      email: 'admin@bookease.com',
      passwordHash,
      role: 'admin',
      phone: '+1 (555) 019-2831'
    });
    await admin.save();

    // Create Demo Client
    const client = new User({
      name: 'Alex Johnson',
      email: 'client@bookease.com',
      passwordHash,
      role: 'client',
      phone: '+1 (555) 392-1049'
    });
    await client.save();

    // Create Demo Provider 1
    const providerUser1 = new User({
      name: 'Dr. Sarah Jenkins',
      email: 'sarah@luminahealth.com',
      passwordHash,
      role: 'provider',
      phone: '+1 (555) 882-9901'
    });
    await providerUser1.save();

    const provider1 = new Provider({
      userId: providerUser1._id,
      businessName: 'Lumina Dental & Wellness Clinic',
      category: 'Clinic',
      description: 'Comprehensive oral care, aesthetic dentistry, and holistic wellness procedures in a calming environment.',
      location: '124 Market Street, Suite 400, San Francisco, CA',
      bufferMinutes: 15,
      cancellationWindowHours: 4,
      avgRating: 4.9,
      isApproved: true
    });
    await provider1.save();

    // Services for Provider 1
    const s1 = new Service({ providerId: provider1._id, name: 'Comprehensive Dental Examination', durationMins: 45, price: 120 });
    const s2 = new Service({ providerId: provider1._id, name: 'Teeth Whitening & Polish', durationMins: 60, price: 200 });
    const s3 = new Service({ providerId: provider1._id, name: 'Emergency Consultation', durationMins: 30, price: 90 });
    await Promise.all([s1.save(), s2.save(), s3.save()]);

    // Availability for Provider 1 (Mon-Fri 9am-5pm)
    const avail1 = new Availability({
      providerId: provider1._id,
      weeklyHours: [1, 2, 3, 4, 5].map(d => ({ dayOfWeek: d, startTime: '09:00', endTime: '17:00' })),
      blockedRanges: []
    });
    await avail1.save();

    // Create Demo Provider 2
    const providerUser2 = new User({
      name: 'Marcus Vance',
      email: 'marcus@vancestudio.com',
      passwordHash,
      role: 'provider',
      phone: '+1 (555) 773-4412'
    });
    await providerUser2.save();

    const provider2 = new Provider({
      userId: providerUser2._id,
      businessName: 'Aura Hair & Styling Studio',
      category: 'Salon',
      description: 'Master hair styling, precision coloring, and luxury spa treatments tailored to your unique style.',
      location: '88 Fashion Avenue, New York, NY',
      bufferMinutes: 10,
      cancellationWindowHours: 2,
      avgRating: 4.8,
      isApproved: true
    });
    await provider2.save();

    // Services for Provider 2
    const s4 = new Service({ providerId: provider2._id, name: 'Signature Haircut & Style', durationMins: 60, price: 85 });
    const s5 = new Service({ providerId: provider2._id, name: 'Balayage & Color Treatment', durationMins: 120, price: 250 });
    await Promise.all([s4.save(), s5.save()]);

    // Availability for Provider 2 (Tue-Sat 10am-6pm)
    const avail2 = new Availability({
      providerId: provider2._id,
      weeklyHours: [2, 3, 4, 5, 6].map(d => ({ dayOfWeek: d, startTime: '10:00', endTime: '18:00' })),
      blockedRanges: []
    });
    await avail2.save();

    // Create Demo Provider 3
    const providerUser3 = new User({
      name: 'Elena Rostova',
      email: 'elena@codementor.io',
      passwordHash,
      role: 'provider',
      phone: '+1 (555) 234-5678'
    });
    await providerUser3.save();

    const provider3 = new Provider({
      userId: providerUser3._id,
      businessName: 'Rostova Tech Academy & Mentorship',
      category: 'Tutor',
      description: '1-on-1 fullstack web development coaching, system architecture review, and interview prep.',
      location: 'Remote / Online Video Call',
      bufferMinutes: 5,
      cancellationWindowHours: 1,
      avgRating: 5.0,
      isApproved: true
    });
    await provider3.save();

    const s6 = new Service({ providerId: provider3._id, name: 'Code Review & Architecture Consultation', durationMins: 60, price: 150 });
    const s7 = new Service({ providerId: provider3._id, name: 'Mock Technical Interview Session', durationMins: 90, price: 220 });
    await Promise.all([s6.save(), s7.save()]);

    const avail3 = new Availability({
      providerId: provider3._id,
      weeklyHours: [1, 2, 3, 4, 5, 6].map(d => ({ dayOfWeek: d, startTime: '08:00', endTime: '20:00' })),
      blockedRanges: []
    });
    await avail3.save();

    console.log('✅ Demo data seeded successfully!');
    console.log('Demo Login Credentials:');
    console.log(' - Admin: admin@bookease.com / password123');
    console.log(' - Client: client@bookease.com / password123');
    console.log(' - Provider: sarah@luminahealth.com / password123');
  } catch (err) {
    console.error('Error seeding demo data:', err.message);
  }
}

module.exports = seedDemoData;
