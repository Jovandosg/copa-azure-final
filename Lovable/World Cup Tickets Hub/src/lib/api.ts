// Configuração da API para conectar ao backend Node.js/Express
// Em produção usa URLs relativas (/api), em dev usa localhost:3001

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface StandingRow {
  team_id: number;
  team_name: string;
  team_code: string;
  team_flag: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface BracketSlot {
  team_id?: number;
  team_code?: string;
  team_name?: string;
  team_flag?: string;
  label: string;
}

export interface BracketMatch {
  match_id: number;
  match_number: number;
  slot1: BracketSlot;
  slot2: BracketSlot;
  score1: number | null;
  score2: number | null;
  status: string;
  date: string | null;
  time: string | null;
  stadium_name: string | null;
  stadium_city: string | null;
}

export interface BracketResponse {
  bracket: {
    round_of_32: BracketMatch[];
    round_of_16: BracketMatch[];
    quarter_final: BracketMatch[];
    semi_final: BracketMatch[];
    third_place: BracketMatch | null;
    final: BracketMatch | null;
  };
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const contentType = response.headers.get('content-type') || '';
      let payload: any = null;

      if (contentType.includes('application/json')) {
        payload = await response.json();
      } else {
        const text = await response.text();
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { error: text };
        }
      }

      if (!response.ok) {
        return { error: payload?.error || `Erro na requisição (${response.status})` };
      }

      return { data: payload as T };
    } catch (error) {
      console.error('API Error:', error);
      return { error: 'Erro de conexão com o servidor' };
    }
  }

  // Auth
  async login(email: string, password: string) {
    const result = await this.request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (result.data?.token) {
      this.setToken(result.data.token);
    }
    
    return result;
  }

  async register(name: string, email: string, password: string) {
    const result = await this.request<{ user: any; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    
    if (result.data?.token) {
      this.setToken(result.data.token);
    }
    
    return result;
  }

  async getMe() {
    return this.request<{ user: any }>('/auth/me');
  }

  logout() {
    this.setToken(null);
  }

  // Matches
  async getMatches(params?: { stage?: string; stadium_id?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<{ matches: any[] }>(`/matches${query}`);
  }

  async getMatch(id: string) {
    return this.request<{ match: any }>(`/matches/${id}`);
  }

  async getMatchTickets(id: string) {
    return this.request<{ tickets: any[] }>(`/matches/${id}/tickets`);
  }

  // Stadiums
  async getStadiums(params?: { country?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<{ stadiums: any[] }>(`/stadiums${query}`);
  }

  async getStadium(id: string) {
    return this.request<{ stadium: any }>(`/stadiums/${id}`);
  }

  // Teams
  async getTeams(params?: { confederation?: string; group_name?: string }) {
    const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return this.request<{ teams: any[] }>(`/teams${query}`);
  }

  async getTeam(id: string) {
    return this.request<{ team: any }>(`/teams/${id}`);
  }

  async getGroups() {
    return this.request<{ groups: any[] }>('/teams/groups');
  }

  // Standings (tabela da Copa)
  async getStandings() {
    return this.request<{ standings: Record<string, StandingRow[]> }>('/standings');
  }

  // Bracket (mata-mata)
  async getBracket() {
    return this.request<BracketResponse>('/bracket');
  }

  // Tickets
  async purchaseTickets(items: { ticket_category_id: number; quantity: number }[]) {
    return this.request<{ message: string; total_amount: number; tickets: any[] }>('/tickets/purchase', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }

  async getMyTickets() {
    return this.request<{ tickets: any[] }>('/tickets/my-tickets');
  }

  // User
  async updateProfile(data: { name: string }) {
    return this.request<{ user: any }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updatePassword(currentPassword: string, newPassword: string) {
    return this.request<{ message: string }>('/users/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Admin - Users
  async getUsers() {
    return this.request<{ users: any[] }>('/users');
  }

  // Admin - Matches
  async createMatch(data: { home_team_id: number; away_team_id: number; stadium_id: number; date: string; time: string; stage: string; group_name?: string }) {
    return this.request<{ match: any; message: string }>('/matches', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMatch(id: number, data: { home_team_id: number; away_team_id: number; stadium_id: number; date: string; time: string; stage: string; group_name?: string; home_score?: number; away_score?: number; status?: string }) {
    return this.request<{ match: any; message: string }>(`/matches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteMatch(id: number) {
    return this.request<{ message: string }>(`/matches/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin - Stadiums
  async createStadium(data: { name: string; city: string; country: string; capacity: number; image?: string; description?: string }) {
    return this.request<{ stadium: any; message: string }>('/stadiums', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStadium(id: number, data: { name: string; city: string; country: string; capacity: number; image?: string; description?: string }) {
    return this.request<{ stadium: any; message: string }>(`/stadiums/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStadium(id: number) {
    return this.request<{ message: string }>(`/stadiums/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin - Sales
  async getSales(params?: { status?: string; start_date?: string; end_date?: string }) {
    // Remove undefined values to prevent "undefined" string in query
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          cleanParams[key] = value;
        }
      });
    }
    const query = Object.keys(cleanParams).length > 0 ? '?' + new URLSearchParams(cleanParams).toString() : '';
    return this.request<{ sales: any[] }>(`/admin/sales${query}`);
  }

  async getSale(id: number) {
    return this.request<{ sale: any }>(`/admin/sales/${id}`);
  }

  async getAdminStats() {
    return this.request<{ stats: any }>('/admin/stats');
  }

  // Health check
  async healthCheck() {
    return this.request<{ status: string; timestamp: string }>('/health');
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
