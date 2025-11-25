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
    if (tmpKnex) {
      try { await tmpKnex.destroy(); } catch {}
    }
  }

  try {
    // Ensure users table exists and has profile columns used by tenantProfile API
    const hasUsers = await db.schema.hasTable('users');
    if (!hasUsers) {
      await db.schema.createTable('users', (t) => {
        t.increments('id').primary();
        t.string('email').notNullable().unique();
        t.string('password').notNullable();
        t.string('firstName');
        t.string('lastName');
        t.string('phone');
        t.string('address');
        t.string('emergency_contact');
        t.string('profile_picture');
        t.enu('role', ['owner', 'tenant']).notNullable().defaultTo('tenant');
        t.timestamp('created_at').defaultTo(db.fn.now());
      });
      console.log('Created table: users');
    } else {
      // Add missing profile columns if necessary
      if (!(await db.schema.hasColumn('users', 'address'))) {
        await db.schema.alterTable('users', (t) => t.string('address'));
        console.log('Added column: users.address');
      }
    }

    // concerns table
    const hasConcerns = await db.schema.hasTable('concerns');
    if (!hasConcerns) {
      await db.schema.createTable('concerns', (t) => {
        t.increments('id').primary();
        t.integer('roomId').unsigned().notNullable();
        t.integer('propertyId').unsigned().notNullable();
        t.integer('tenantId').unsigned().notNullable();
        t.integer('ownerId').unsigned().notNullable();
        t.string('sender').notNullable();
        t.text('category');
        t.text('message');
        t.enum('status', ['open', 'closed']).notNullable().defaultTo('open');
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('roomId').references('id').inTable('rooms').onDelete('CASCADE');
        t.foreign('tenantId').references('id').inTable('users').onDelete('CASCADE');
      });
      console.log('Created table: concerns');
    }
    // bills_rent table
  const hasBillsRent = await db.schema.hasTable('bills_rent');
  if (!hasBillsRent) {
    await db.schema.createTable('bills_rent', (t) => {
      t.increments('id').primary();
      t.integer('ownerid').unsigned().notNullable();
      t.integer('tenantid').unsigned().notNullable();
      t.integer('roomid').unsigned().notNullable();
      t.integer('propertyid').unsigned().notNullable();
      t.integer('paymentfrequency').notNullable();
      t.date('move_in').notNullable();
      t.integer('year').notNullable();
      t.integer('month').notNullable();
      t.date('due_date').notNullable();
      t.string('status').notNullable().defaultTo('Unpaid');
      t.string('receipt'); // <-- Add this line
      t.string('Action'); 
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.foreign('ownerid').references('id').inTable('users').onDelete('CASCADE');
      t.foreign('tenantid').references('id').inTable('users').onDelete('CASCADE');
      t.foreign('roomid').references('id').inTable('rooms').onDelete('CASCADE');
      t.foreign('propertyid').references('id').inTable('properties').onDelete('CASCADE');
    });
    console.log('Created table: bills_rent');
  } else {
    // Add status column if it doesn't exist
    const hasStatus = await db.schema.hasColumn('bills_rent', 'status');
    if (!hasStatus) {
      await db.schema.table('bills_rent', (t) => {
        t.enum('status', ['Unpaid', 'Paid', 'Pending']).notNullable().defaultTo('Unpaid');
      });
      console.log('Added status column to bills_rent');
    }
    // Add receipt column if it doesn't exist
    const hasReceipt = await db.schema.hasColumn('bills_rent', 'receipt');
    if (!hasReceipt) {
      await db.schema.table('bills_rent', (t) => {
        t.string('receipt');
      });
      console.log('Added receipt column to bills_rent');
    }
      // Add Action column if it doesn't exist
      const hasAction = await db.schema.hasColumn('bills_rent', 'Action');
      if (!hasAction) {
        await db.schema.table('bills_rent', (t) => {
          t.string('Action');
        });
        console.log('Added Action column to bills_rent');
   }
  }
    // bills table
   // bills table
    const hasBills = await db.schema.hasTable('bills');
    if (!hasBills) {
      await db.schema.createTable('bills', (t) => {
        t.increments('id').primary();
        t.integer('tenantId').unsigned().notNullable();
        t.decimal('amount', 10, 2).notNullable().defaultTo(0);
        t.string('type').notNullable();
        t.string('status').notNullable().defaultTo('unpaid');
        t.integer('year').notNullable();   // <-- Add year column
        t.integer('month').notNullable();  // <-- Add month column
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.enum('verification', ['pending', 'verified', 'rejected']).notNullable().defaultTo('pending');
        t.string('receipt').nullable();
        t.foreign('tenantId').references('id').inTable('users').onDelete('CASCADE');
      });
      console.log('Created table: bills with year and month columns');
    } else {
      // Remove due_date column if it exists
      const hasDueDate = await db.schema.hasColumn('bills', 'due_date');
      if (hasDueDate) {
        await db.schema.table('bills', (t) => {
          t.dropColumn('due_date');
        });
        console.log('Removed due_date column from bills');
      }
      // Add year column if it doesn't exist
      const hasYear = await db.schema.hasColumn('bills', 'year');
      if (!hasYear) {
        await db.schema.table('bills', (t) => {
          t.integer('year').notNullable().defaultTo(2000);
        });
        console.log('Added year column to bills');
      }
      // Add month column if it doesn't exist
      const hasMonth = await db.schema.hasColumn('bills', 'month');
      if (!hasMonth) {
        await db.schema.table('bills', (t) => {
          t.integer('month').notNullable().defaultTo(1);
        });
        console.log('Added month column to bills');
      }
    }

   // concern_messages table
    const hasConcernMessages = await db.schema.hasTable('concern_messages');
    if (!hasConcernMessages) {
      await db.schema.createTable('concern_messages', (t) => {
        t.increments('id').primary();
        t.integer('concernid').unsigned().notNullable();
        t.enum('sender', ['tenant', 'owner']).notNullable();
        t.text('message').notNullable();
        t.enum('status', ['sent', 'read']).notNullable().defaultTo('sent');
        t.timestamp('created_at').defaultTo(db.fn.now());
        t.foreign('concernid').references('id').inTable('concerns').onDelete('CASCADE');
      });
      console.log('Created table: concern_messages');
    }


  } catch (err) {
    console.error('Error during DB schema setup:', err);
    throw err;
  }
}

module.exports = { knex: db, setupDatabase }; 