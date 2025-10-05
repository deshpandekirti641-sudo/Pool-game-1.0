'use client'

export interface User {
  id: string;
  phone?: string;
  email?: string;
  username: string;
  walletBalance: number;
  isVerified: boolean;
  createdAt: Date;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  totalEarnings: number;
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Username: string;
  player2Username: string;
  entryFee: number;
  prizePool: number;
  winnerPayout: number;
  serverFee: number;
  status: 'waiting' | 'active' | 'completed' | 'cancelled' | 'timeout';
  winnerId?: string;
  winnerUsername?: string;
  startTime?: Date;
  endTime?: Date;
  duration: number; // 60 seconds
  gameState: GameState;
}

export interface GameState {
  currentTurn: 'player1' | 'player2';
  player1Score: number;
  player2Score: number;
  ballsRemaining: number[];
  timeRemaining: number;
  lastShotTime?: Date;
  shots: Shot[];
}

export interface Shot {
  playerId: string;
  timestamp: Date;
  ballsPocketed: number[];
  isValidShot: boolean;
  points: number;
}

export interface Tournament {
  id: string;
  name: string;
  entryFee: number;
  maxPlayers: number;
  currentPlayers: number;
  status: 'open' | 'active' | 'completed';
  startTime: Date;
  prizePool: number;
  matches: Match[];
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'entry_fee' | 'winner_payout' | 'server_fee' | 'deposit' | 'withdrawal';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  matchId?: string;
  description: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
}

export interface AdminStats {
  totalUsers: number;
  activeMatches: number;
  completedMatches: number;
  totalRevenue: number;
  dailyRevenue: number;
  averageMatchDuration: number;
  userRegistrations: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
}

export class TournamentManager {
  private static instance: TournamentManager;
  private users: Map<string, User> = new Map();
  private matches: Map<string, Match> = new Map();
  private tournaments: Map<string, Tournament> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  
  // Developer wallet controls
  private readonly DEVELOPER_CONTACTS = ['8976096360', 'deshpandekirti641@gmail.com'];
  private developerWalletBalance: number = 0;
  
  // Match settings
  private readonly ENTRY_FEE = 10;
  private readonly PRIZE_POOL = 20;
  private readonly WINNER_PAYOUT = 16;
  private readonly SERVER_FEE = 4;
  private readonly MATCH_DURATION = 60; // seconds

  public static getInstance(): TournamentManager {
    if (!TournamentManager.instance) {
      TournamentManager.instance = new TournamentManager();
    }
    return TournamentManager.instance;
  }

  constructor() {
    this.loadFromStorage();
    
    // Auto-save every 30 seconds
    setInterval(() => this.saveToStorage(), 30000);
  }

  // User Management
  createUser(userData: {
    phone?: string;
    email?: string;
    username: string;
  }): User {
    const user: User = {
      id: this.generateId(),
      phone: userData.phone,
      email: userData.email,
      username: userData.username,
      walletBalance: 100, // Starting bonus
      isVerified: false,
      createdAt: new Date(),
      gamesPlayed: 0,
      gamesWon: 0,
      winRate: 0,
      totalEarnings: 0,
    };
    
    this.users.set(user.id, user);
    this.saveToStorage();
    return user;
  }

  getUserById(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUserByContact(contact: string): User | undefined {
    return Array.from(this.users.values()).find(user => 
      user.phone === contact || user.email === contact
    );
  }

  updateUserWallet(userId: string, amount: number, type: Transaction['type'], matchId?: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    const balanceBefore = user.walletBalance;
    const balanceAfter = balanceBefore + amount;
    
    if (balanceAfter < 0) return false; // Insufficient funds

    user.walletBalance = balanceAfter;
    
    // Record transaction
    const transaction: Transaction = {
      id: this.generateId(),
      userId,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      matchId,
      description: this.getTransactionDescription(type, amount, matchId),
      timestamp: new Date(),
      status: 'completed',
    };
    
    this.transactions.set(transaction.id, transaction);
    this.users.set(userId, user);
    this.saveToStorage();
    return true;
  }

  // Match Management
  createMatch(player1Id: string): Match {
    const player1 = this.users.get(player1Id);
    if (!player1 || player1.walletBalance < this.ENTRY_FEE) {
      throw new Error('Insufficient funds for entry fee');
    }

    const match: Match = {
      id: this.generateId(),
      player1Id,
      player2Id: '',
      player1Username: player1.username,
      player2Username: '',
      entryFee: this.ENTRY_FEE,
      prizePool: this.PRIZE_POOL,
      winnerPayout: this.WINNER_PAYOUT,
      serverFee: this.SERVER_FEE,
      status: 'waiting',
      duration: this.MATCH_DURATION,
      gameState: {
        currentTurn: 'player1',
        player1Score: 0,
        player2Score: 0,
        ballsRemaining: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        timeRemaining: this.MATCH_DURATION,
        shots: [],
      },
    };

    // Deduct entry fee
    this.updateUserWallet(player1Id, -this.ENTRY_FEE, 'entry_fee', match.id);
    
    this.matches.set(match.id, match);
    this.saveToStorage();
    return match;
  }

  joinMatch(matchId: string, player2Id: string): boolean {
    const match = this.matches.get(matchId);
    const player2 = this.users.get(player2Id);
    
    if (!match || !player2 || match.status !== 'waiting') return false;
    if (player2.walletBalance < this.ENTRY_FEE) return false;
    if (match.player1Id === player2Id) return false;

    // Deduct entry fee
    this.updateUserWallet(player2Id, -this.ENTRY_FEE, 'entry_fee', matchId);
    
    match.player2Id = player2Id;
    match.player2Username = player2.username;
    match.status = 'active';
    match.startTime = new Date();
    
    this.matches.set(matchId, match);
    this.startMatchTimer(matchId);
    this.saveToStorage();
    return true;
  }

  endMatch(matchId: string, winnerId?: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active') return;

    match.status = 'completed';
    match.endTime = new Date();
    
    if (winnerId) {
      match.winnerId = winnerId;
      const winner = this.users.get(winnerId);
      if (winner) {
        match.winnerUsername = winner.username;
        
        // Pay winner
        this.updateUserWallet(winnerId, this.WINNER_PAYOUT, 'winner_payout', matchId);
        
        // Update stats
        winner.gamesWon++;
        winner.totalEarnings += this.WINNER_PAYOUT - this.ENTRY_FEE; // Net earnings
        this.users.set(winnerId, winner);
      }
    }

    // Update player stats
    const player1 = this.users.get(match.player1Id);
    const player2 = this.users.get(match.player2Id);
    
    if (player1) {
      player1.gamesPlayed++;
      player1.winRate = (player1.gamesWon / player1.gamesPlayed) * 100;
      this.users.set(match.player1Id, player1);
    }
    
    if (player2) {
      player2.gamesPlayed++;
      player2.winRate = (player2.gamesWon / player2.gamesPlayed) * 100;
      this.users.set(match.player2Id, player2);
    }

    // Add to developer wallet
    this.developerWalletBalance += this.SERVER_FEE;
    
    this.matches.set(matchId, match);
    this.saveToStorage();
  }

  private startMatchTimer(matchId: string): void {
    setTimeout(() => {
      const match = this.matches.get(matchId);
      if (match && match.status === 'active') {
        match.status = 'timeout';
        this.endMatch(matchId);
      }
    }, this.MATCH_DURATION * 1000);
  }

  // Admin Functions (Developer Access Only)
  verifyDeveloperAccess(contact: string): boolean {
    return this.DEVELOPER_CONTACTS.includes(contact);
  }

  getDeveloperWalletBalance(contact: string): number {
    if (!this.verifyDeveloperAccess(contact)) return 0;
    return this.developerWalletBalance;
  }

  getAdminStats(contact: string): AdminStats | null {
    if (!this.verifyDeveloperAccess(contact)) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const users = Array.from(this.users.values());
    const matches = Array.from(this.matches.values());
    const transactions = Array.from(this.transactions.values());

    const completedMatches = matches.filter(m => m.status === 'completed');
    const serverFeeTransactions = transactions.filter(t => t.type === 'server_fee');
    
    return {
      totalUsers: users.length,
      activeMatches: matches.filter(m => m.status === 'active').length,
      completedMatches: completedMatches.length,
      totalRevenue: this.developerWalletBalance,
      dailyRevenue: serverFeeTransactions
        .filter(t => t.timestamp >= today)
        .reduce((sum, t) => sum + t.amount, 0),
      averageMatchDuration: completedMatches.length > 0 
        ? completedMatches.reduce((sum, m) => {
            const duration = m.endTime && m.startTime 
              ? (m.endTime.getTime() - m.startTime.getTime()) / 1000 
              : 0;
            return sum + duration;
          }, 0) / completedMatches.length
        : 0,
      userRegistrations: {
        today: users.filter(u => u.createdAt >= today).length,
        thisWeek: users.filter(u => u.createdAt >= thisWeek).length,
        thisMonth: users.filter(u => u.createdAt >= thisMonth).length,
      },
    };
  }

  // Getters
  getAllMatches(): Match[] {
    return Array.from(this.matches.values());
  }

  getActiveMatches(): Match[] {
    return this.getAllMatches().filter(m => m.status === 'active');
  }

  getWaitingMatches(): Match[] {
    return this.getAllMatches().filter(m => m.status === 'waiting');
  }

  getMatchById(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  getUserTransactions(userId: string): Transaction[] {
    return Array.from(this.transactions.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Utility Functions
  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private getTransactionDescription(type: Transaction['type'], amount: number, matchId?: string): string {
    switch (type) {
      case 'entry_fee':
        return `Match entry fee: ₹${Math.abs(amount)} (Match ID: ${matchId})`;
      case 'winner_payout':
        return `Match winnings: ₹${amount} (Match ID: ${matchId})`;
      case 'server_fee':
        return `Server fee collection: ₹${amount}`;
      case 'deposit':
        return `Wallet deposit: ₹${amount}`;
      case 'withdrawal':
        return `Wallet withdrawal: ₹${Math.abs(amount)}`;
      default:
        return `Transaction: ₹${amount}`;
    }
  }

  private saveToStorage(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tournament_users', JSON.stringify(Array.from(this.users.entries())));
      localStorage.setItem('tournament_matches', JSON.stringify(Array.from(this.matches.entries())));
      localStorage.setItem('tournament_transactions', JSON.stringify(Array.from(this.transactions.entries())));
      localStorage.setItem('developer_wallet', this.developerWalletBalance.toString());
    }
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined') {
      try {
        const users = localStorage.getItem('tournament_users');
        if (users) {
          this.users = new Map(JSON.parse(users).map(([k, v]: [string, any]) => [k, {
            ...v,
            createdAt: new Date(v.createdAt)
          }]));
        }

        const matches = localStorage.getItem('tournament_matches');
        if (matches) {
          this.matches = new Map(JSON.parse(matches).map(([k, v]: [string, any]) => [k, {
            ...v,
            startTime: v.startTime ? new Date(v.startTime) : undefined,
            endTime: v.endTime ? new Date(v.endTime) : undefined,
          }]));
        }

        const transactions = localStorage.getItem('tournament_transactions');
        if (transactions) {
          this.transactions = new Map(JSON.parse(transactions).map(([k, v]: [string, any]) => [k, {
            ...v,
            timestamp: new Date(v.timestamp)
          }]));
        }

        const developerWallet = localStorage.getItem('developer_wallet');
        if (developerWallet) {
          this.developerWalletBalance = parseFloat(developerWallet);
        }
      } catch (error) {
        console.error('Error loading tournament data from storage:', error);
      }
    }
  }
}

// OTP Generator for authentication
export class OTPManager {
  private static otps: Map<string, { code: string; expiry: Date; verified: boolean }> = new Map();
  
  static generateOTP(contact: string): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    this.otps.set(contact, { code, expiry, verified: false });
    
    // Simulate sending OTP (in real app, this would call SMS/email service)
    console.log(`OTP for ${contact}: ${code}`);
    
    return code;
  }
  
  static verifyOTP(contact: string, code: string): boolean {
    const otpData = this.otps.get(contact);
    if (!otpData) return false;
    
    if (new Date() > otpData.expiry) {
      this.otps.delete(contact);
      return false;
    }
    
    if (otpData.code === code) {
      otpData.verified = true;
      return true;
    }
    
    return false;
  }
  
  static isVerified(contact: string): boolean {
    const otpData = this.otps.get(contact);
    return otpData?.verified === true;
  }
}