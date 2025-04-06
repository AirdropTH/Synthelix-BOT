const axios = require('axios');
const ethers = require('ethers');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const userAgents = require('user-agents');
const colors = require('colors');
const { DateTime } = require('luxon');

class SynthelixBot {
  constructor() {
    this.DELAY_BETWEEN_WALLETS = 2000; // Delay between wallets (ms)
    this.MAX_RETRIES = 3; // Maximum retries on error
    this.CHECK_INTERVAL = 60 * 1000; // Check interval (ms)
    this.TASK_DELAY = 3000; // Delay between tasks (ms)

    this.privateKeys = []; // Array to store private keys
    this.proxies = []; // Array to store proxies (can be empty)

    this.loadData(); // Load data from files
  }

  // Log with color and timestamp
  log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case 'success': console.log(`[${timestamp}] [✓] ${msg}`.green); break;
      case 'custom': console.log(`[${timestamp}] [*] ${msg}`.magenta); break;
      case 'error': console.log(`[${timestamp}] [✗] ${msg}`.red); break;
      case 'warning': console.log(`[${timestamp}] [!] ${msg}`.yellow); break;
      default: console.log(`[${timestamp}] [ℹ] ${msg}`.blue); break;
    }
  }

  // Load private keys from data.txt and proxies from proxy.txt (if available)
  loadData() {
    // Load private keys
    if (fs.existsSync('./data.txt')) {
      this.privateKeys = fs.readFileSync('./data.txt', 'utf8')
        .split('\n')
        .map(key => key.trim())
        .filter(key => key && !key.startsWith('#'));
      this.log(`Loaded ${this.privateKeys.length} wallets from data.txt`, 'success');
    } else {
      this.log('data.txt file not found', 'error');
      process.exit(1);
    }

    if (this.privateKeys.length === 0) {
      this.log('No wallets found in data.txt', 'error');
      process.exit(1);
    }

    // Load proxies (optional)
    if (fs.existsSync('./proxy.txt')) {
      this.proxies = fs.readFileSync('./proxy.txt', 'utf8')
        .split('\n')
        .map(proxy => proxy.trim())
        .filter(proxy => proxy && !proxy.startsWith('#') && proxy.startsWith('http://'));
      this.log(`Loaded ${this.proxies.length} proxies from proxy.txt`, 'success');
    } else {
      this.log('proxy.txt not found, running without proxies', 'warning');
    }

    // Warn if the number of proxies doesn't match the number of wallets, but still proceed
    if (this.proxies.length > 0 && this.proxies.length < this.privateKeys.length) {
      this.log(`Number of proxies (${this.proxies.length}) is less than number of wallets (${this.privateKeys.length}), some wallets will run without proxies`, 'warning');
    }
  }

  // Create proxy agent if proxy is provided, return null if not
  createProxyAgent(proxyString) {
    if (!proxyString) return null;
    try {
      return new HttpsProxyAgent(proxyString);
    } catch (error) {
      this.log(`Error creating proxy agent: ${error.message}`, 'warning');
      return null;
    }
  }

  // Create axios config based on proxy (if available)
  getAxiosConfig(proxyAgent) {
    return proxyAgent ? { httpsAgent: proxyAgent, httpAgent: proxyAgent } : {};
  }

  // Generate random User-Agent
  getRandomUserAgent() {
    const ua = new userAgents({ deviceCategory: 'desktop' });
    return ua.toString();
  }

  // Generate random string
  generateRandomString(length) {
    return [...Array(length)].map(() => Math.random().toString(36)[2] || '0').join('')
      .replace(/(.{1,4})/g, (m) => Math.random() > 0.5 ? m.toUpperCase() : m);
  }

  async getReferralCode() {
    try {
      if (!fs.existsSync('code.txt')) {
        return "a1xZyAsO"; 
      }
      const code = fs.readFileSync('code.txt', 'utf8').trim();
      return code || "a1xZyAsO";
    } catch (error) {
      this.log(`Error reading referral code: ${error.message}`, 'error');
      return "he2a1xZyAsODnOfw";
    }
  }

  // Login and start node for a wallet
  async startSynthelixNodeForWallet(privateKey, proxyString, walletLabel, retryCount = 0) {
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const proxyAgent = this.createProxyAgent(proxyString);
    const axiosConfig = this.getAxiosConfig(proxyAgent);
    const userAgent = this.getRandomUserAgent();

    this.log(`Processing ${walletLabel}: ${shortAddress}${proxyString ? ' (with proxy)' : ''}`, 'custom');

    try {
      // Set up basic headers
      const headers = {
        'accept': '*/*',
        'content-type': 'application/json',
        'user-agent': userAgent,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Referer': 'https://dashboard.synthelix.io/'
      };

      // Get CSRF token
      const csrfResponse = await axios.get('https://dashboard.synthelix.io/api/auth/csrf', { ...axiosConfig, headers });
      const csrfToken = csrfResponse.data.csrfToken;
      let cookies = csrfResponse.headers['set-cookie']?.join('; ') || '';

      // Create data to sign
      const nonce = this.generateRandomString(32);
      const requestId = Date.now().toString();
      const issuedAt = new Date().toISOString();
      const domain = { name: "Synthelix", version: "1", chainId: 1, verifyingContract: "0x0000000000000000000000000000000000000000" };
      const types = { Authentication: [{ name: "address", type: "address" }, { name: "statement", type: "string" }, { name: "nonce", type: "string" }, { name: "requestId", type: "string" }, { name: "issuedAt", type: "string" }] };
      const value = { address, statement: "Sign in to enter Synthelix Dashboard.", nonce, requestId, issuedAt };

      // Sign data
      const signature = await wallet.signTypedData(domain, types, value);

      const ref = await this.getReferralCode();
      this.log(`- Using referral code: ${ref} -\n`, 'success');

      // Login
      const authData = new URLSearchParams({
        address, signature, 
        domain: JSON.stringify(domain), 
        types: JSON.stringify(types), 
        value: JSON.stringify(value),
        redirect: 'false', 
        callbackUrl: '/', 
        referralCode: ref, 
        csrfToken, 
        json: 'true'
      });
      const authResponse = await axios.post('https://dashboard.synthelix.io/api/auth/callback/web3', authData.toString(), {
        ...axiosConfig,
        headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded', 'Cookie': cookies }
      });
      this.log('Login successful', 'success');
      cookies = authResponse.headers['set-cookie']?.join('; ') || cookies;

      // Check and complete tasks
      await this.checkAndCompleteTasks(cookies, headers, axiosConfig, walletLabel, address);

      // Check node status
      const statusInfo = await this.getNodeStatus(cookies, headers, axiosConfig);
      if (statusInfo.nodeRunning && statusInfo.currentEarnedPoints > 0) {
        await axios.post('https://dashboard.synthelix.io/api/node/stop', {
          claimedHours: statusInfo.currentEarnedPoints / statusInfo.pointsPerHour,
          pointsEarned: statusInfo.currentEarnedPoints
        }, { ...axiosConfig, headers: { ...headers, 'Cookie': cookies } });
        this.log(`Stopped node and claimed ${statusInfo.currentEarnedPoints} points`, 'success');
        await this.delay(1000);
      }

      // Start node
      await axios.post('https://dashboard.synthelix.io/api/node/start', null, { ...axiosConfig, headers: { ...headers, 'Cookie': cookies } });
      this.log(`Node started successfully for ${walletLabel}`, 'success');

      // Claim daily rewards
      await this.claimDailyRewards(address, cookies, headers, axiosConfig, walletLabel);

      // Update info
      const updatedStatus = await this.getNodeStatus(cookies, headers, axiosConfig);
      const pointsInfo = await this.getPointsInfo(cookies, headers, axiosConfig);

      this.log(`Status ${walletLabel}: ${updatedStatus.nodeRunning ? 'Running' : 'Stopped'}`, 'custom');
      this.log(`Time remaining: ${this.formatTime(updatedStatus.timeLeft)} | Total points: ${pointsInfo.totalPoints}`, 'info');

      return { success: true, address, cookies, headers, axiosConfig, statusInfo: updatedStatus, pointsInfo, walletLabel };
    } catch (error) {
      this.log(`Error with ${walletLabel}: ${error.message}`, 'error');
      if (retryCount < this.MAX_RETRIES) {
        this.log(`Retrying ${walletLabel} (Attempt ${retryCount + 1}/${this.MAX_RETRIES})`, 'warning');
        await this.delay(5000);
        return this.startSynthelixNodeForWallet(privateKey, proxyString, walletLabel, retryCount + 1);
      }
      return { success: false, address, error: error.message, walletLabel };
    }
  }

  // Check and complete tasks
  async checkAndCompleteTasks(cookies, commonHeaders, axiosConfig, walletLabel, address) {
    try {
      const profileHeaders = {
        ...commonHeaders,
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
        'Cookie': cookies,
        'Referer': 'https://dashboard.synthelix.io/rewards',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
      };
      const profileResponse = await axios.get('https://dashboard.synthelix.io/api/user/getprofile2', {
        ...axiosConfig,
        headers: profileHeaders
      });

      const completedTasks = profileResponse.data.completedTasks || [];
      const requiredTasks = [
        "Follow the Official Synthelix X Account",
        "Follow Jessie — Your AI Companion in the Synthelix Ecosystem",
        "Follow Hedgecast AI — Our Partner in AI Development"
      ];

      for (const taskTitle of requiredTasks) {
        if (!completedTasks.includes(taskTitle)) {
          this.log(`Task "${taskTitle}" not completed, processing...`, 'warning');
          try {
            const taskPayload = { taskTitle, points: "5000" };
            const taskResponse = await axios.post('https://dashboard.synthelix.io/api/tasks/complete', taskPayload, {
              ...axiosConfig,
              headers: { ...commonHeaders, 'Cookie': cookies, 'content-type': 'application/json' }
            });
            this.log(`Completed "${taskTitle}" | Received: ${taskResponse.data.points} points`, 'success');
            await this.delay(this.TASK_DELAY);
          } catch (error) {
            this.log(`Error completing "${taskTitle}": ${error.message}`, 'error');
          }
        }
      }
    } catch (error) {
      this.log(`Error checking tasks: ${error.message}`, 'warning');
    }
  }

  // Claim daily rewards
  async claimDailyRewards(address, cookies, headers, axiosConfig, walletLabel) {
    try {
      const profileResponse = await axios.get('https://dashboard.synthelix.io/api/user/getprofile2', {
        ...axiosConfig,
        headers: { ...headers, 'Cookie': cookies }
      });
      const lastDailyClaim = profileResponse.data.lastDailyClaim;
      const now = DateTime.now();

      if (!lastDailyClaim || now.diff(DateTime.fromISO(lastDailyClaim), 'hours').hours >= 24) {
        await axios.post('https://dashboard.synthelix.io/api/rew/dailypoints', { points: 1000 }, {
          ...axiosConfig,
          headers: { ...headers, 'Cookie': cookies }
        });
        this.log(`Daily reward claimed successfully for ${walletLabel}`, 'success');
        return true;
      }
      this.log(`Not yet time to claim daily reward for ${walletLabel}`, 'info');
      return false;
    } catch (error) {
      this.log(`Error claiming daily reward: ${error.message}`, 'warning');
      return false;
    }
  }

  // Get node status
  async getNodeStatus(cookies, headers, axiosConfig) {
    try {
      const response = await axios.get('https://dashboard.synthelix.io/api/node/status', {
        ...axiosConfig,
        headers: { ...headers, 'Cookie': cookies }
      });
      return response.data;
    } catch (error) {
      this.log(`Error getting node status: ${error.message}`, 'warning');
      return { nodeRunning: false, timeLeft: 0, currentEarnedPoints: 0, pointsPerHour: 0 };
    }
  }

  // Get points info
  async getPointsInfo(cookies, headers, axiosConfig) {
    try {
      const response = await axios.get('https://dashboard.synthelix.io/api/get/points', {
        ...axiosConfig,
        headers: { ...headers, 'Cookie': cookies }
      });
      return { totalPoints: response.data.points || 0 };
    } catch (error) {
      this.log(`Error getting points: ${error.message}`, 'warning');
      return { totalPoints: 0 };
    }
  }

  // Format time
  formatTime(seconds) {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours ? hours + 'h ' : ''}${minutes ? minutes + 'm ' : ''}${secs}s`.trim();
  }

  // Delay for a specified time
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main function
  async main() {
    const walletSessions = {};

    // Start each wallet
    for (let i = 0; i < this.privateKeys.length; i++) {
      const privateKey = this.privateKeys[i];
      const walletLabel = `Wallet ${i + 1}`;
      const proxy = this.proxies[i] || null; // Use proxy if available, otherwise null

      const result = await this.startSynthelixNodeForWallet(privateKey, proxy, walletLabel);
      if (result.success) {
        walletSessions[result.address] = result;
      }
      await this.delay(this.DELAY_BETWEEN_WALLETS);
    }

    // Periodic check loop
    while (true) {
      console.clear();
      for (let i = 0; i < this.privateKeys.length; i++) {
        const privateKey = this.privateKeys[i];
        const wallet = new ethers.Wallet(privateKey);
        const address = wallet.address;
        const walletLabel = `Wallet ${i + 1}`;
        const proxy = this.proxies[i] || null;

        if (walletSessions[address]) {
          const session = walletSessions[address];
          const statusInfo = await this.getNodeStatus(session.cookies, session.headers, session.axiosConfig);

          if (!statusInfo.nodeRunning || statusInfo.timeLeft < 600) {
            if (statusInfo.nodeRunning && statusInfo.currentEarnedPoints > 0) {
              await axios.post('https://dashboard.synthelix.io/api/node/stop', {
                claimedHours: statusInfo.currentEarnedPoints / statusInfo.pointsPerHour,
                pointsEarned: statusInfo.currentEarnedPoints
              }, { ...session.axiosConfig, headers: { ...session.headers, 'Cookie': session.cookies } });
              this.log(`Stopped node and claimed ${statusInfo.currentEarnedPoints} points`, 'success');
              await this.delay(1000);
            }

            await axios.post('https://dashboard.synthelix.io/api/node/start', null, {
              ...session.axiosConfig,
              headers: { ...session.headers, 'Cookie': session.cookies }
            });
            this.log(`Restarted node for ${walletLabel}`, 'success');

            await this.claimDailyRewards(address, session.cookies, session.headers, session.axiosConfig, walletLabel);
            await this.checkAndCompleteTasks(session.cookies, session.headers, session.axiosConfig, walletLabel, address);
            const updatedStatus = await this.getNodeStatus(session.cookies, session.headers, session.axiosConfig);
            const updatedPoints = await this.getPointsInfo(session.cookies, session.headers, session.axiosConfig);
            walletSessions[address].statusInfo = updatedStatus;
            walletSessions[address].pointsInfo = updatedPoints;
          }

          this.log(`${walletLabel}: ${address.slice(0, 6)}...${address.slice(-4)} - ${statusInfo.nodeRunning ? 'Running' : 'Stopped'}`, 'custom');
          this.log(`Time remaining: ${this.formatTime(statusInfo.timeLeft)} | Total points: ${walletSessions[address].pointsInfo.totalPoints}`, 'info');
        } else {
          this.log(`Session expired for ${walletLabel}, logging in again...`, 'warning');
          const result = await this.startSynthelixNodeForWallet(privateKey, proxy, walletLabel);
          if (result.success) walletSessions[address] = result;
        }
        await this.delay(this.DELAY_BETWEEN_WALLETS);
      }

      this.log(`Checking again in ${this.CHECK_INTERVAL / 1000} seconds...`, 'info');
      await this.delay(this.CHECK_INTERVAL);
    }
  }
}

const bot = new SynthelixBot();
bot.main();