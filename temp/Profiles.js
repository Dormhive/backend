import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

export default function ProfilePage() {
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: ''
  });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/profiles/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setProfile(res.data.profile || {});
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load profile');
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfile((p) => ({ ...p, [name]: value }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`${API_URL}/profiles/me`, {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setProfile(res.data.profile);
      setSuccess('Profile updated successfully');
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setError('');
    setSuccess('');
  };

  return (
    <div className="dashboard-container">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>My Profile</h2>
        <p style={{ margin: '8px 0 0 0', color: '#666' }}>Manage your account information</p>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading profile...</p>
      ) : (
        <div style={{ maxWidth: 600, background: '#fff', padding: 24, borderRadius: 8, border: '1px solid #eee' }}>
          {error && (
            <div style={{
              marginBottom: 16,
              padding: 12,
              backgroundColor: '#ffebee',
              color: '#c33',
              borderRadius: 4,
              fontSize: '0.9em'
            }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{
              marginBottom: 16,
              padding: 12,
              backgroundColor: '#e8f5e9',
              color: '#188a00',
              borderRadius: 4,
              fontSize: '0.9em'
            }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSaveProfile}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>First Name</label>
              <input
                type="text"
                name="firstName"
                value={profile.firstName || ''}
                onChange={handleInputChange}
                disabled={!editing}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 4,
                  border: '1px solid #ddd',
                  fontSize: '0.95em',
                  backgroundColor: editing ? '#fff' : '#f5f5f5',
                  cursor: editing ? 'text' : 'default'
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Last Name</label>
              <input
                type="text"
                name="lastName"
                value={profile.lastName || ''}
                onChange={handleInputChange}
                disabled={!editing}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 4,
                  border: '1px solid #ddd',
                  fontSize: '0.95em',
                  backgroundColor: editing ? '#fff' : '#f5f5f5',
                  cursor: editing ? 'text' : 'default'
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Email</label>
              <input
                type="email"
                name="email"
                value={profile.email || ''}
                onChange={handleInputChange}
                disabled={!editing}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 4,
                  border: '1px solid #ddd',
                  fontSize: '0.95em',
                  backgroundColor: editing ? '#fff' : '#f5f5f5',
                  cursor: editing ? 'text' : 'default'
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Phone</label>
              <input
                type="tel"
                name="phone"
                value={profile.phone || ''}
                onChange={handleInputChange}
                disabled={!editing}
                placeholder="(Optional)"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 4,
                  border: '1px solid #ddd',
                  fontSize: '0.95em',
                  backgroundColor: editing ? '#fff' : '#f5f5f5',
                  cursor: editing ? 'text' : 'default'
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Role</label>
              <input
                type="text"
                value={profile.role || 'N/A'}
                disabled
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 4,
                  border: '1px solid #ddd',
                  fontSize: '0.95em',
                  backgroundColor: '#f5f5f5',
                  cursor: 'default'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              {!editing ? (
                <button
                  type="button"
                  className="submit-btn"
                  onClick={() => setEditing(true)}
                  style={{ flex: 1 }}
                >
                  Edit Profile
                </button>
              ) : (
                <>
                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={saving}
                    style={{ flex: 1 }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    className="submit-btn"
                    onClick={handleCancel}
                    style={{ flex: 1, backgroundColor: '#999' }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}