const pool = require('./pool');

const initializeDatabase = async () => {
  const maxRetries = 5;
  let attempt = 1;
  while (attempt <= maxRetries) {
    try {
      console.log(`Attempt ${attempt} to connect to database...`);
      const connection = await pool.query('SELECT NOW()');
      console.log('✅ Database connected at:', connection.rows[0].now);

      // Enable PostGIS extension
      await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
      const postgisCheck = await pool.query('SELECT postgis_version()');
      console.log('✅ PostGIS enabled:', postgisCheck.rows[0].postgis_version);

      // Create tables (users, providers, projects, bids, reviews, gallery_images, messages, refresh_tokens)
      console.log('Creating users table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(20) CHECK (role IN ('user', 'provider', 'admin')),
          phone VARCHAR(20),
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Users table created');

      console.log('Creating providers table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS providers (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id),
          name VARCHAR(255) NOT NULL,
          certifications JSONB,
          services JSONB,
          rating NUMERIC,
          location GEOMETRY(POINT, 4326),
          created_at TIMESTAMP DEFAULT NOW(),
          service_type VARCHAR(50) CHECK (service_type IN ('rwh', 'borehole')),
          license_number VARCHAR(100),
          service_areas TEXT[],
          description TEXT,
          image TEXT,
          price_range_min INTEGER,
          price_range_max INTEGER,
          reviews INTEGER DEFAULT 0,
          UNIQUE(user_id)
        )`);
      console.log('✅ Providers table created');

      console.log('Creating projects table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          service_type VARCHAR(50) CHECK (service_type IN ('rwh', 'borehole')),
          location GEOMETRY(POINT, 4326),
          budget NUMERIC,
          provider_id INT REFERENCES providers(id),
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
          permit_required BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Projects table created');

      console.log('Creating bids table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bids (
          id SERIAL PRIMARY KEY,
          project_id INT REFERENCES projects(id),
          provider_id INT REFERENCES providers(id),
          amount NUMERIC NOT NULL,
          description TEXT,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Bids table created');

      console.log('Creating reviews table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          provider_id INT REFERENCES providers(id),
          user_id INT REFERENCES users(id),
          rating INT CHECK (rating BETWEEN 1 AND 5),
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Reviews table created');

      console.log('Creating gallery_images table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS gallery_images (
          id SERIAL PRIMARY KEY,
          provider_id INT REFERENCES providers(id),
          image_url TEXT NOT NULL,
          caption TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Gallery_images table created');

      console.log('Creating messages table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          sender_id INT REFERENCES users(id),
          receiver_id INT REFERENCES users(id),
          project_id INT REFERENCES projects(id) NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Messages table created');

      console.log('Creating refresh_tokens table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )`);
      console.log('✅ Refresh_tokens table created');

      console.log('✅ Tables created successfully');
      break;
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed:`, {
        message: err.message,
        code: err.code,
        detail: err.detail,
        stack: err.stack,
      });
      if (attempt === maxRetries) {
        console.error('❌ Max retries reached. Database initialization failed.');
        process.exit(1);
      }
      attempt++;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

module.exports = initializeDatabase;