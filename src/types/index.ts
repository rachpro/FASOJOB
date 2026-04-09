export type ContractType = 'CDD' | 'CDI' | 'Stage' | 'Apprentissage' | 'Interim';

export interface JobOffer {
  id: string;
  title: string;
  description: string;
  location: string;
  contractType: ContractType;
  sector: string;
  keywords: string[];
  company: string;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  name: string;
  bio: string;
  skills: string[];
  location: string;
  phone: string;
  preferences?: {
    sectors?: string[];
    locations?: string[];
    contractTypes?: ContractType[];
  };
}

export interface Application {
  id: string;
  userId: string;
  offerId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export interface Alert {
  id: string;
  userId: string;
  criteria: {
    keywords?: string[];
    location?: string;
    contractType?: ContractType;
    sector?: string;
  };
  createdAt: number;
}
