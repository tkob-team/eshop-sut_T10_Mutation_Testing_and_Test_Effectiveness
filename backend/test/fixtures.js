const request = require('supertest');

const ALICE = { name: 'Alice', email: 'alice@test.local', password: 'Password123!' };
const BOB = { name: 'Bob', email: 'bob@test.local', password: 'Bobpass123!' };
const NEW_USER = { name: 'Carol', email: 'carol@test.local', password: 'Carol123!x' };
const STRONG_PASSWORD = 'NewPassw0rd!';

const login = (app, email, password) => request(app).post('/api/login').send({ email, password });
const loginOk = async (app, user) => (await login(app, user.email, user.password)).body.token;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { ALICE, BOB, NEW_USER, STRONG_PASSWORD, login, loginOk, bearer };
