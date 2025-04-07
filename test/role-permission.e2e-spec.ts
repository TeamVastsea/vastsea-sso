import {
  getRedisToken,
  DEFAULT_REDIS_NAMESPACE,
} from '@liaoliaots/nestjs-redis';
import { HttpStatus, INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { clear } from './utils/setup';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { createUser } from './utils/create-user';
import { createClient } from './utils/create-client';
import { ClientService } from '../src/client/client.service';
import { login } from './utils/login';
import request from 'supertest';
import { CreatePermission } from 'src/permission/dto/create-permission';
import { Client, Permission } from '@prisma/client';
import { createPermission } from './utils/create-permission';
import { UpdatePermission } from 'src/permission/dto/update-permission';
import { CreateRole } from 'src/role/dto/create-role.dto';
import { createRole } from './utils/create-role';
import { RoleService } from '../src/role/role.service';

/**
 * @description Role 和 Permission 几乎不会独立出现. 这里直接混合测试了.
 */
describe('Role And Permission end to end test', () => {
  let app: INestApplication;
  let redis: Redis;
  const createTestClient = async (name: string) => {
    const client = await createClient(
      {
        name,
        desc: name,
        redirect: '',
      },
      app.get(ClientService),
    );
    return client;
  };
  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .setLogger(new Logger())
      .compile();
    app = moduleFixture.createNestApplication();

    redis = app.get(getRedisToken(DEFAULT_REDIS_NAMESPACE));
    await clear('sqlite');
    await redis.flushdb();
    await app.init();
    expect(redis).toBeDefined();
    await createUser(app, redis, 'test@no-reply.com', 'test');
  });
  describe('Permission', () => {
    const tokenPair = {
      admin: { access: '' },
      test: { access: '' },
    };
    beforeEach(async () => {
      const { access_token: admin } = await login(
        'admin@no-reply.com',
        'admin',
        process.env.CLIENT_ID,
        app,
      );
      const { access_token: test } = await login(
        'test@no-reply.com',
        'test',
        process.env.CLIENT_ID,
        app,
      );
      tokenPair.admin.access = admin;
      tokenPair.test.access = test;
    });
    describe('Create Permission', () => {
      it('Should success', async () => {
        const client = await createTestClient('test-a');
        const { statusCode, body } = await request(app.getHttpServer())
          .post('/permission')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'TEST::PERMISSION',
            desc: 'TEST::PERMISSION',
            clientId: client.clientId,
          } as CreatePermission);
        const p = body as Permission;
        expect(p.clientId).toBe(client.clientId);
        expect(p.clientId).not.toBe(process.env.CLIENT_ID);
        expect(statusCode).toBe(HttpStatus.CREATED);
      });
      it('Should return 403', async () => {
        const client = await createTestClient('test-a');
        const { statusCode } = await request(app.getHttpServer())
          .post('/permission')
          .auth(tokenPair.test.access, { type: 'bearer' })
          .send({
            name: 'TEST::PERMISSION',
            desc: 'TEST::PERMISSION',
            clientId: client.clientId,
          } as CreatePermission);
        expect(statusCode).toBe(HttpStatus.FORBIDDEN);
      });
      it('Should return 400, because require ClientId but receive undefined', async () => {
        const { statusCode } = await request(app.getHttpServer())
          .post('/permission')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'TEST::PERMISSION',
            desc: 'TEST::PERMISSION',
          } as CreatePermission);
        expect(statusCode).toBe(HttpStatus.BAD_REQUEST);
      });
      it('Should return 400, because permission exists', async () => {
        const client = await createTestClient('test-a');
        const { statusCode, body } = await request(app.getHttpServer())
          .post('/permission')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'TEST::PERMISSION',
            desc: 'TEST::PERMISSION',
            clientId: client.clientId,
          } as CreatePermission);
        const { statusCode: s2 } = await request(app.getHttpServer())
          .post('/permission')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'TEST::PERMISSION',
            desc: 'TEST::PERMISSION',
            clientId: client.clientId,
          } as CreatePermission);
        const p = body as Permission;
        expect(p.clientId).toBe(client.clientId);
        expect(p.clientId).not.toBe(process.env.CLIENT_ID);
        expect(statusCode).toBe(HttpStatus.CREATED);
        expect(s2).toBe(HttpStatus.BAD_REQUEST);
      });
      it('should return 200, Even if permissions exist, they are not in the same client', async () => {
        const clients = [
          await createTestClient('test-a'),
          await createTestClient('test-b'),
        ];
        for (const client of clients) {
          const { statusCode, body } = await request(app.getHttpServer())
            .post('/permission')
            .auth(tokenPair.admin.access, { type: 'bearer' })
            .send({
              name: 'TEST::PERMISSION',
              desc: 'TEST::PERMISSION',
              clientId: client.clientId,
            } as CreatePermission);
          const p = body as Permission;
          console.log(p);
          expect(statusCode).toBe(HttpStatus.CREATED);
        }
      });
    });
    describe('Remove Permission', () => {
      it('Should succes', async () => {
        const client = await createTestClient('test-a');
        const permission = await createPermission(
          'test-permission',
          client.clientId,
          app,
        );
        const { statusCode } = await request(app.getHttpServer())
          .del(`/permission/${permission.id}`)
          .query({ clientId: client.clientId })
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.OK);
      });
      it('Should return 403', async () => {
        const client = await createTestClient('test-a');
        const permission = await createPermission(
          'test-permission',
          client.clientId,
          app,
        );
        const { statusCode } = await request(app.getHttpServer())
          .del(`/permission/${permission.id}`)
          .query({ clientId: client.clientId })
          .auth(tokenPair.test.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.FORBIDDEN);
      });
      it('Should return 404, because permission not found', async () => {
        const client = await createTestClient('test-a');
        const { statusCode } = await request(app.getHttpServer())
          .del(`/permission/114514`)
          .query({ clientId: client.clientId })
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.NOT_FOUND);
      });
    });
    describe('Update Permission', () => {
      it('Should succes', async () => {
        const client = await createTestClient('test-a');
        const permission = await createPermission(
          'test-permission',
          client.clientId,
          app,
        );
        const { statusCode, body } = await request(app.getHttpServer())
          .patch(`/permission/${permission.id}`)
          .query({ clientId: client.clientId })
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'Test-2',
          } as UpdatePermission);
        expect(body.name).not.toBe(permission.name);
        expect(body.desc).toBe(permission.desc);
        expect(statusCode).toBe(HttpStatus.OK);
      });
      it('Should return 403', async () => {
        const client = await createTestClient('test-a');
        const permission = await createPermission(
          'test-permission',
          client.clientId,
          app,
        );
        const { statusCode } = await request(app.getHttpServer())
          .patch(`/permission/${permission.id}`)
          .query({ clientId: client.clientId })
          .auth(tokenPair.test.access, { type: 'bearer' })
          .send({
            name: 'Test-2',
          } as UpdatePermission);
        expect(statusCode).toBe(HttpStatus.FORBIDDEN);
      });
      it('Should return 404, because permission not found', async () => {
        const { statusCode } = await request(app.getHttpServer())
          .patch(`/permission/114514`)
          .query({ clientId: process.env.CLIENT_ID })
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'Test-2',
          } as UpdatePermission);
        expect(statusCode).toBe(HttpStatus.NOT_FOUND);
      });
    });
    describe('Get Permission Info', () => {
      it('Should succes', async () => {
        const p = await createPermission('test', process.env.CLIENT_ID, app);
        const { statusCode, body } = await request(app.getHttpServer())
          .get(`/permission/${p.id}`)
          .query({ clientId: process.env.CLIENT_ID })
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.OK);
        expect(body.id).toBe(p.id.toString());
        expect(body.name).toBe(p.name);
      });
      it('Should return 403', async () => {
        const p = await createPermission('test', process.env.CLIENT_ID, app);
        const { statusCode } = await request(app.getHttpServer())
          .get(`/permission/${p.id}`)
          .query({ clientId: process.env.CLIENT_ID })
          .auth(tokenPair.test.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.FORBIDDEN);
      });
      it('Should return 404, because permission not found', async () => {
        const { statusCode, body } = await request(app.getHttpServer())
          .get(`/permission/800`)
          .query({ clientId: process.env.CLIENT_ID })
          .auth(tokenPair.admin.access, { type: 'bearer' });
        console.log(body);
        expect(statusCode).toBe(HttpStatus.NOT_FOUND);
      });
    });
    describe('Get Permission List', () => {
      beforeEach(async () => {
        for (let i = 0; i < 20; i++) {
          await createPermission(`permission-${i}`, process.env.CLIENT_ID, app);
        }
      });
      it('Should succes', async () => {
        const { statusCode, body } = await request(app.getHttpServer())
          .get('/permission')
          .query({
            clientId: process.env.CLIENT_ID,
          })
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.OK);
        expect(body.data).toHaveLength(10);
        const { body: b2 } = await request(app.getHttpServer())
          .get('/permission')
          .query({
            clientId: process.env.CLIENT_ID,
            preId: body.data.at(-1).id,
          })
          .auth(tokenPair.admin.access, { type: 'bearer' });
        const id1 = body.data.map((item) => item.id) as string[];
        const id2 = b2.data.map((item) => item.id) as string[];
        expect(id2.every((id) => id1.includes(id))).toBe(false);
      });
      it('Should return 403', async () => {
        const { statusCode } = await request(app.getHttpServer())
          .get('/permission')
          .query({
            clientId: process.env.CLIENT_ID,
          })
          .auth(tokenPair.test.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.FORBIDDEN);
      });
    });
  });
  describe('Role', () => {
    const tokenPair = {
      admin: { access: '' },
      test: { access: '' },
    };
    beforeEach(async () => {
      const { access_token: admin } = await login(
        'admin@no-reply.com',
        'admin',
        process.env.CLIENT_ID,
        app,
      );
      const { access_token: test } = await login(
        'test@no-reply.com',
        'test',
        process.env.CLIENT_ID,
        app,
      );
      tokenPair.admin.access = admin;
      tokenPair.test.access = test;
    });
    describe('Create Role', () => {
      let client: Client;
      beforeEach(async () => {
        client = await createTestClient('test-a');
      });
      it('Should Success', async () => {
        const { statusCode } = await request(app.getHttpServer())
          .post('/role')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'test-role',
            desc: 'TestRole',
            clientId: client.clientId,
          } as CreateRole);
        expect(statusCode).toBe(HttpStatus.CREATED);
      });
      it('Should return 403', async () => {
        const { statusCode } = await request(app.getHttpServer())
          .post('/role')
          .auth(tokenPair.test.access, { type: 'bearer' })
          .send({
            name: 'test-role',
            desc: 'TestRole',
            clientId: client.clientId,
          } as CreateRole);
        expect(statusCode).toBe(HttpStatus.FORBIDDEN);
      });
      it('Should return 400, because role exists', async () => {
        const h1 = await request(app.getHttpServer())
          .post('/role')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'test-role',
            desc: 'TestRole',
            clientId: client.clientId,
          } as CreateRole);
        expect(h1.statusCode).toBe(HttpStatus.CREATED);
        const h2 = await request(app.getHttpServer())
          .post('/role')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'test-role',
            desc: 'TestRole',
            clientId: client.clientId,
          } as CreateRole);
        expect(h2.statusCode).toBe(HttpStatus.BAD_REQUEST);
      });
      it('Should success, even if role exist, they are not in the same client', async () => {
        const h1 = await request(app.getHttpServer())
          .post('/role')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'test-role',
            desc: 'TestRole',
            clientId: client.clientId,
          } as CreateRole);
        expect(h1.statusCode).toBe(HttpStatus.CREATED);
        const h2 = await request(app.getHttpServer())
          .post('/role')
          .auth(tokenPair.admin.access, { type: 'bearer' })
          .send({
            name: 'test-role',
            desc: 'TestRole',
            clientId: process.env.CLIENT_ID,
          } as CreateRole);
        console.log(h2.body);
        expect(h2.statusCode).toBe(HttpStatus.CREATED);
      });
    });
    describe('Remove Role', () => {
      it('Should Success', async () => {
        const service = app.get(RoleService);
        const role = await createRole(service, 'test', [], []);
        const { statusCode } = await request(app.getHttpServer())
          .del(`/role/${role.id}`)
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.OK);

        const { statusCode: s2, body } = await request(app.getHttpServer())
          .get(`/role/${role.id}`)
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(body.deleted).toBe(true);
        expect(s2).toBe(HttpStatus.OK);
      });
      it('Should return 403', async () => {
        const service = app.get(RoleService);
        const role = await createRole(service, 'test', [], []);
        const { statusCode } = await request(app.getHttpServer())
          .del(`/role/${role.id}`)
          .auth(tokenPair.test.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.FORBIDDEN);
      });
      it('Should return 404, because role not found', async () => {
        const service = app.get(RoleService);
        await createRole(service, 'test', [], []);
        const { statusCode } = await request(app.getHttpServer())
          .del(`/role/100`)
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.NOT_FOUND);
      });
      it('Should return 400, because The current role has been inherited by another role, and the child role needs to be deleted first', async () => {
        const s = app.get(RoleService);
        const p = await createRole(s, 'p1', [], [], process.env.CLIENT_ID);
        const p2 = await createRole(s, 'p2', [], []);
        const c = await createRole(s, 'c', [p, p2], []);
        const { statusCode } = await request(app.getHttpServer())
          .del(`/role/${p.id}`)
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(statusCode).toBe(HttpStatus.BAD_REQUEST);
        const { statusCode: s2 } = await request(app.getHttpServer())
          .del(`/role/${p2.id}`)
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(s2).toBe(HttpStatus.BAD_REQUEST);
        await request(app.getHttpServer())
          .del(`/role/${c.id}`)
          .auth(tokenPair.admin.access, { type: 'bearer' });

        const { statusCode: s3 } = await request(app.getHttpServer())
          .del(`/role/${p2.id}`)
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(s3).toBe(HttpStatus.OK);

        const { statusCode: s4 } = await request(app.getHttpServer())
          .del(`/role/${p.id}`)
          .auth(tokenPair.admin.access, { type: 'bearer' });
        expect(s4).toBe(HttpStatus.OK);
      });
    });
    describe('Update Role', () => {
      it.todo('Should Success');
      it.todo('Should return 403');
      it.todo('Should return 404, current role not found');
      describe('Inheritance Role', () => {
        describe('Single inheritance', () => {
          it.todo('Should success. Get Role Info can get parent role info');
          it.todo('Should return 404, because parent is not found');
        });
        describe('Multiple Inheritance', () => {
          it.todo('Should success. Get Role Info can get parent roles info');
          it.todo('Should return 404, because parent is not found');
        });
      });
    });
    describe('Get Role Info', () => {
      it.todo('Should Success');
      it.todo('Should return 403');
      it.todo('Should return 404, role not found');
    });
    describe('Get Role List', () => {
      it.todo('Should Success');
      it.todo('Should return 403');
    });
  });
});
