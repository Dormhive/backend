const knexLib = require('knex');

const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'dormhive',
};

const knexConfig = {
  client: 'mysql2',
  connection: dbConfig,
  pool: { min: 0, max: 10 },
};

const db = knexLib(knexConfig);

async function setupDatabase() {
  let tempKnex;
  try {
    // Connect without selecting a database to create it if missing
    tempKnex = knexLib({
      client: 'mysql2',
      connection: {
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password,
      },
    });

    await tempKnex.raw('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci', [dbConfig.database]);
  } catch (err) {
    console.error('Error creating database:', err);
    throw err;
  } finally {
    if (tempKnex) {
      try { await tempKnex.destroy(); } catch (_) {}
    }
  }

  try {
    // Create tables if they don't exist
    const existsUsers = await db.schema.hasTable('users');
    if (!existsUsers) {
      await db.schema.createTable('users', (t) => {
        t.increments('id').primary();
        t.string('email').notNullable().unique();
        t.string('password').notNullable();
        t.string('firstName').notNullable();
        t.string('lastName').notNullable();
        t.string('phone').nullable();
        t.enum('role', ['tenant', 'owner']).notNullable().defaultTo('tenant');
        t.boolean('isVerified').notNullable().defaultTo(true);
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      console.log('Created table: users');
    }

    const existsProperties = await db.schema.hasTable('properties');
    if (!existsProperties) {
      await db.schema.createTable('properties', (t) => {
        t.increments('id').primary();
        t.integer('ownerId').unsigned().notNullable();
        t.string('propertyName').notNullable();
        t.string('address').notNullable();
        t.text('description').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('ownerId').references('id').inTable('users').onDelete('CASCADE');
      });
      console.log('Created table: properties');
    }

    const existsRooms = await db.schema.hasTable('rooms');
    if (!existsRooms) {
      await db.schema.createTable('rooms', (t) => {
        t.increments('id').primary();
        t.integer('propertyId').unsigned().notNullable();
        t.string('roomNumber').notNullable();
        t.string('type').notNullable();
        t.decimal('monthlyRent', 10, 2).notNullable();
        t.integer('capacity').nullable();
        t.text('amenities').nullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('propertyId').references('id').inTable('properties').onDelete('CASCADE');
      });
      console.log('Created table: rooms');
    }

    // Create room_tenants table (new)
    const existsRoomTenants = await db.schema.hasTable('room_tenants');
    if (!existsRoomTenants) {
      await db.schema.createTable('room_tenants', (t) => {
        t.increments('id').primary();
        t.integer('roomId').unsigned().notNullable();
        t.integer('tenantId').unsigned().notNullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('roomId').references('id').inTable('rooms').onDelete('CASCADE');
        t.foreign('tenantId').references('id').inTable('users').onDelete('CASCADE');
        t.unique(['roomId', 'tenantId']); // prevent duplicate assignments
      });
      console.log('Created table: room_tenants');
    }

  } catch (error) {
    console.error('Error setting up tables:', error);
    throw error;
  }
}

module.exports = { knex: db, setupDatabase };