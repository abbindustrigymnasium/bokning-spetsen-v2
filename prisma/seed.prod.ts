import { closePrisma, seedAdmin } from './seed-utils.js';

try {
	await seedAdmin();
	console.log('Production seed completed.');
} finally {
	await closePrisma();
}
