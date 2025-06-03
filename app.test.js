const request = require('supertest');
const mysql = require('mysql2');
const { S3Client } = require('@aws-sdk/client-s3');

jest.mock('mysql2');
jest.mock('@aws-sdk/client-s3');

const mockQuery = jest.fn();
mysql.createConnection.mockReturnValue({
  connect: jest.fn((cb) => cb(null)),
  query: mockQuery,
});

const mockSend = jest.fn();
S3Client.prototype.send = mockSend;

describe('Recipe API - Basic Passing Tests', () => {
  let app;

  beforeAll(() => {
    app = require('./app');  // make sure your app exports express app
  });

  beforeEach(() => {
    mockQuery.mockReset();
    mockSend.mockReset();
  });

  it('should fetch all recipes', async () => {
    const fakeMovies = [{ id: 1, title: 'Recipe1' }, { id: 2, title: 'Recipe2' }];
    mockQuery.mockImplementation((sql, cb) => cb(null, fakeMovies));

    const res = await request(app).get('/recipes');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(fakeRecipes);
    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM recipes', expect.any(Function));
  });

  it('should fetch recipe by ID', async () => {
    const recipe = { id: 123, title: 'Test Recipe' };
    mockQuery.mockImplementation((sql, values, cb) => cb(null, [recipe]));

    const res = await request(app).get('/recipe/123');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(recipe);
  });

  it('should return 404 if recipe not found by ID', async () => {
    mockQuery.mockImplementation((sql, values, cb) => cb(null, []));

    const res = await request(app).get('/recipes/9999');

    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('error', 'Recipe not found');
  });

  it('should handle POST /recipes file upload (mocked)', async () => {
    mockSend.mockResolvedValue({});
    mockQuery.mockImplementation((sql, values, cb) => cb(null, { insertId: 123 }));

    const res = await request(app)
      .post('/recipes')
      .field('title', 'Test Recipe')
      .field('country', 'India')
      .field('description', 'Test description')
      .field('rating', '4.5')
      .field('founded_year', '2023')
      .attach('image', Buffer.from('fake image content'), 'test-image.jpg')
      .attach('video', Buffer.from('fake video content'), 'test-video.mp4');

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('recipeId', 123);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
