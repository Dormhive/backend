const knexLib = require('knex');

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'dormhive',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
};

const knexConfig = {
  client: 'mysql2',
  connection: {
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    port: dbConfig.port,
  },
  pool: { min: 0, max: 10 },
  acquireConnectionTimeout: 10000,
};

const db = knexLib(knexConfig);

async function setupDatabase() {
  let tmpKnex;
  try {
    // ensure database exists (connect without specifying DB)
    tmpKnex = knexLib({
      client: 'mysql2',
      connection: { host: dbConfig.host, user: dbConfig.user, password: dbConfig.password },
    });
    await tmpKnex.raw(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
  } catch (err) {
    console.error('Error ensuring database exists:', err);
    throw err;
  } finally {
    if (tmpKnex) await tmpKnex.destroy();
  }

  try {
    // users table
    const hasUsers = await db.schema.hasTable('users');
    if (!hasUsers) {
      await db.schema.createTable('users', (t) => {
        t.increments('id').primary();
        t.string('firstName').notNullable();
        t.string('lastName').notNullable();
        t.string('email').notNullable().unique();
        t.string('passwordHash').notNullable();
        t.string('role').notNullable().defaultTo('tenant');
        t.string('phone').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      console.log('Created table: users');
    }

    // properties table
    const hasProperties = await db.schema.hasTable('properties');
    if (!hasProperties) {
      await db.schema.createTable('properties', (t) => {
        t.increments('id').primary();
        t.integer('ownerId').unsigned().notNullable();
        t.string('propertyName').notNullable();
        t.text('address').notNullable();
        t.text('description').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('ownerId').references('id').inTable('users').onDelete('CASCADE');
      });
      console.log('Created table: properties');
    }

    // rooms table
    const hasRooms = await db.schema.hasTable('rooms');
    if (!hasRooms) {
      await db.schema.createTable('rooms', (t) => {
        t.increments('id').primary();
        t.integer('propertyId').unsigned().notNullable();
        t.string('roomNumber').notNullable();
        t.string('type').nullable();
        t.decimal('monthlyRent', 10, 2).defaultTo(0);
        t.integer('capacity').defaultTo(1);
        t.text('amenities').nullable();
        t.enum('paymentSchedule', ['1st', '15th']).notNullable().defaultTo('1st');
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('propertyId').references('id').inTable('properties').onDelete('CASCADE');
      });
      console.log('Created table: rooms (with paymentSchedule)');
    } else {
      const hasPaymentSchedule = await db.schema.hasColumn('rooms', 'paymentSchedule');
      if (!hasPaymentSchedule) {
        await db.schema.table('rooms', (t) => {
          t.enum('paymentSchedule', ['1st', '15th']).notNullable().defaultTo('1st');
        });
        console.log('Added paymentSchedule column to rooms');
      } else {
        try {
          await db('rooms').where({ paymentSchedule: 'every 1st day of every month' }).update({ paymentSchedule: '1st' });
          await db('rooms').where({ paymentSchedule: 'every 15th day of every month' }).update({ paymentSchedule: '15th' });
        } catch (_) {}
      }
    }

    // room_tenants table
    const hasRoomTenants = await db.schema.hasTable('room_tenants');
    if (!hasRoomTenants) {
      await db.schema.createTable('room_tenants', (t) => {
        t.increments('id').primary();
        t.integer('roomId').unsigned().notNullable();
        t.integer('tenantId').unsigned().notNullable();
        t.enum('paymentSchedule', ['1st', '15th']).notNullable().defaultTo('1st');
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('roomId').references('id').inTable('rooms').onDelete('CASCADE');
        t.foreign('tenantId').references('id').inTable('users').onDelete('CASCADE');
        t.unique(['roomId', 'tenantId']);
      });
      console.log('Created table: room_tenants (with paymentSchedule)');
    } else {
      const hasRTPaymentSchedule = await db.schema.hasColumn('room_tenants', 'paymentSchedule');
      if (!hasRTPaymentSchedule) {
        await db.schema.table('room_tenants', (t) => {
          t.enum('paymentSchedule', ['1st', '15th']).notNullable().defaultTo('1st');
        });
        console.log('Added paymentSchedule column to room_tenants');
      } else {
        try {
          await db('room_tenants').where({ paymentSchedule: 'every 1st day of every month' }).update({ paymentSchedule: '1st' });
          await db('room_tenants').where({ paymentSchedule: 'every 15th day of every month' }).update({ paymentSchedule: '15th' });
        } catch (_) {}
      }
    }

    // concers table
    const hasConcerns = await db.schema.hasTable('concerns');
    if (!hasConcerns) {
      await db.schema.createTable('concerns', (t) => {
        t.increments('id').primary();
        t.integer('tenantid').unsigned().notNullable();
        t.integer('ownerid').unsigned().notNullable();
        t.string('sender').notNullable().defaultTo('Tenant');
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.integer('roomid').unsigned().nullable();
        t.integer('propertyid').unsigned().nullable();
        t.string('category').notNullable();
        t.text('message').notNullable();
        t.string('status').notNullable().defaultTo('Open');
      });
      console.log('Created table: concerns');
    }

    // bills table
    const hasBills = await db.schema.hasTable('bills');
    if (!hasBills) {
      await db.schema.createTable('bills', (t) => {
        t.increments('id').primary();
        t.integer('tenantId').unsigned().notNullable();
        t.decimal('amount', 10, 2).notNullable().defaultTo(0);
        t.string('type').notNullable();
        t.string('status').notNullable().defaultTo('unpaid');
        t.timestamp('due_date').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.enum('verification', ['pending', 'verified', 'rejected']).notNullable().defaultTo('pending');
        t.string('receipt').nullable(); // <-- Add this line
        t.foreign('tenantId').references('id').inTable('users').onDelete('CASCADE');
      });
      console.log('Created table: bills with receipt column');
    } else {
      const hasReceipt = await db.schema.hasColumn('bills', 'receipt');
      if (!hasReceipt) {
        await db.schema.table('bills', (t) => {
          t.string('receipt').nullable();
        });
        console.log('Added receipt column to bills');
      }
    }
  } catch (err) {
    console.error('Error setting up tables:', err);
    throw err;
  }
}

module.exports = { knex: db, setupDatabase };