async function testRegister() {
    const data = {
        name: 'Test Antigravity',
        email: `test-${Date.now()}@example.com`,
        phone: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        password: 'Password123!'
    };

    console.log('--- Testing Registration ---');
    console.log('Data:', data);

    try {
        const response = await fetch('http://localhost:4000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Registration SUCCESS!');
            console.log('Response:', JSON.stringify(result, null, 2));
        } else {
            console.log('❌ Registration FAILED!');
            console.log('Status:', response.status);
            console.log('Data:', JSON.stringify(result, null, 2));
        }
    } catch (error) {
        console.error('❌ Connection Error:', error.message);
    }
}

testRegister();
