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
      if (!(await db.schema.hasColumn('users', 'emergency_contact'))) {
        await db.schema.alterTable('users', (t) => t.string('emergency_contact'));
        console.log('Added column: users.emergency_contact');
      }
      if (!(await db.schema.hasColumn('users', 'profile_picture'))) {
        await db.schema.alterTable('users', (t) => t.string('profile_picture'));
        console.log('Added column: users.profile_picture');
      }
    }

    // ensure uploads directory exists
    const uploadsDir = require('path').join(__dirname, '..', 'uploads');
    require('fs').mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.error('Error during DB schema setup:', err);
    throw err;
  }
}

module.exports = { knex: db, setupDatabase }; 