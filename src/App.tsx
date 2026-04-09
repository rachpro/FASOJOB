import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, User, Search, Bell, Briefcase, ChevronRight, 
  MessageSquare, FileText, Download, Building2, 
  Users, LayoutDashboard, Plus, MapPin, Filter, 
  CheckCircle2, Globe, Sparkles, LogOut, Settings,
  GraduationCap, BookOpen, Clock, Award, PlayCircle,
  Printer, Loader2, Heart, Share2, MoreHorizontal,
  MessageCircle
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import { classifyIntent, parseSearchCriteria, parseUserProfile, generateCV } from './services/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function calculateMatchScore(job: JobOffer, profile: TalentProfile | null): number {
  if (!profile) return 0;
  let score = 0;

  // 1. Skills Match (up to 50 points)
  if (job.requiredSkills && job.requiredSkills.length > 0 && profile.skills && profile.skills.length > 0) {
    const profileSkillsLower = profile.skills.map(s => s.toLowerCase());
    const matchedSkills = job.requiredSkills.filter(s => 
      profileSkillsLower.some(ps => ps.includes(s.toLowerCase()) || s.toLowerCase().includes(ps))
    );
    score += (matchedSkills.length / job.requiredSkills.length) * 50;
  }

  // 2. Location Match (up to 20 points)
  if (job.location && profile.location && job.location.toLowerCase() === profile.location.toLowerCase()) {
    score += 20;
  }

  // 3. Title/Bio Keyword Match (up to 30 points)
  const jobTitleWords = job.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const profileText = `${profile.title || ''} ${profile.bio || ''}`.toLowerCase();
  
  if (jobTitleWords.length > 0) {
    const matchedWords = jobTitleWords.filter(w => profileText.includes(w));
    score += Math.min((matchedWords.length / jobTitleWords.length) * 30, 30);
  }

  return Math.round(score);
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: number;
  isCV?: boolean;
}

interface JobOffer {
  id: string;
  title: string;
  company: string;
  location: string;
  contract: 'CDI' | 'CDD' | 'Stage' | 'Apprentissage';
  sector: string;
  description: string;
  postedAt: number;
  deadline?: number;
  experienceLevel: 'Junior' | 'Intermédiaire' | 'Senior';
  salaryRange?: string;
  requiredSkills: string[];
}

interface TalentProfile {
  id: string;
  name: string;
  title: string;
  skills: string[];
  location: string;
  bio: string;
  email?: string;
  phone?: string;
  experiences?: Experience[];
  educations?: Education[];
}

interface JobAlert {
  id: string;
  keywords: string[];
  location?: string;
  contractType?: string;
  sector?: string;
  email?: string;
}

interface Application {
  id: string;
  jobId: string;
  userId: string;
  status: 'En attente' | 'Acceptée' | 'Refusée';
  appliedAt: number;
}

interface Experience {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  description: string;
}

interface Education {
  id: string;
  degree: string;
  school: string;
  startDate: string;
  endDate: string;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  participantName: string;
  participantRole: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadCount: number;
}

interface CVData extends Partial<TalentProfile> {
  email?: string;
  phone?: string;
  experiences: Experience[];
  educations: Education[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'network' | 'jobs' | 'talents' | 'recruiter' | 'applications' | 'bot' | 'learning' | 'resources' | 'profile' | 'messages'>('home');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Bienvenue sur FasoJob ! 🇧🇫\n\nJe suis votre assistant intelligent pour l'emploi.\n\nCommandes :\n- 'Profil: [vos infos]' pour vous enregistrer.\n- 'Recherche: [votre besoin]' pour trouver des offres.\n- 'Générer mon CV' pour créer votre CV pro.\n- 'Aide' pour voir ce message.",
      sender: 'bot',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterExperience, setFilterExperience] = useState<string>('Tous');
  const [filterContract, setFilterContract] = useState<string>('Tous');
  const [filterSkill, setFilterSkill] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // User Profile State (Simulated)
  const [userProfile, setUserProfile] = useState<TalentProfile | null>(null);

  // Job Offers State
  const [jobOffers, setJobOffers] = useState<JobOffer[]>([]);

  const filteredJobs = jobOffers
    .filter(job => {
      const matchesQuery = !searchQuery || 
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesExperience = filterExperience === 'Tous' || job.experienceLevel === filterExperience;
      const matchesContract = filterContract === 'Tous' || job.contract === filterContract;
      const matchesSkill = !filterSkill || job.requiredSkills.some(s => s.toLowerCase().includes(filterSkill.toLowerCase()));

      return matchesQuery && matchesExperience && matchesContract && matchesSkill;
    })
    .map(job => ({
      ...job,
      matchScore: calculateMatchScore(job, userProfile)
    }))
    .sort((a, b) => {
      if (userProfile && b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore; // Sort by match score if profile exists
      }
      return b.postedAt - a.postedAt; // Otherwise sort by newest
    });

  // Talent Pool State
  const [talents, setTalents] = useState<TalentProfile[]>([]);

  // Alerts State
  const [alerts, setAlerts] = useState<JobAlert[]>([]);

  // Applications State
  const [applications, setApplications] = useState<Application[]>([]);

  const [newJob, setNewJob] = useState<Partial<JobOffer>>({ title: '', company: '', location: '', contract: 'CDI', sector: '', description: '', requiredSkills: [], postedAt: Date.now() });
  const [skillsInput, setSkillsInput] = useState('');
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false);

  // CV Builder State
  const [cvData, setCvData] = useState<CVData>({
    name: '',
    title: '',
    location: '',
    bio: '',
    skills: [],
    email: '',
    phone: '',
    experiences: [],
    educations: []
  });
  const [cvColor, setCvColor] = useState<string>('#075e54');
  const [cvLayout, setCvLayout] = useState<'modern' | 'classic'>('modern');
  const [cvFont, setCvFont] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [generatedCV, setGeneratedCV] = useState<string | null>(null);
  const [isGeneratingCV, setIsGeneratingCV] = useState(false);
  const cvPreviewRef = useRef<HTMLDivElement>(null);

  // Formations State
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  // Internal Messaging State
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 'c1',
      participantName: 'Coris Bank RH',
      participantRole: 'Recruteur',
      lastMessage: 'Bonjour, votre profil nous intéresse pour le poste de développeur.',
      lastMessageAt: Date.now() - 3600000,
      unreadCount: 1
    },
    {
      id: 'c2',
      participantName: 'Orange Burkina',
      participantRole: 'Recruteur',
      lastMessage: 'Pouvez-vous nous envoyer votre portfolio ?',
      lastMessageAt: Date.now() - 86400000,
      unreadCount: 0
    }
  ]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'm1', conversationId: 'c1', senderId: 'recruiter1', senderName: 'Coris Bank RH', text: 'Bonjour, votre profil nous intéresse pour le poste de développeur.', timestamp: Date.now() - 3600000 }
  ]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [newChatMessage, setNewChatMessage] = useState('');

  // Sync userProfile with cvData if it exists
  useEffect(() => {
    if (userProfile) {
      setCvData(prev => ({ ...prev, ...userProfile }));
    }
  }, [userProfile]);

  const handleDownloadPDF = () => {
    if (!cvPreviewRef.current) return;
    const opt = {
      margin:       10,
      filename:     `CV_${cvData.name?.replace(/\s+/g, '_') || 'FasoJob'}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(cvPreviewRef.current).save();
  };

  const handleSendChatMessage = () => {
    if (!newChatMessage.trim() || !activeConversationId) return;
    
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      conversationId: activeConversationId,
      senderId: userProfile?.id || 'user',
      senderName: userProfile?.name || 'Moi',
      text: newChatMessage,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, newMessage]);
    setConversations(prev => prev.map(c => 
      c.id === activeConversationId 
        ? { ...c, lastMessage: newChatMessage, lastMessageAt: Date.now() }
        : c
    ));
    setNewChatMessage('');
  };

  const handleStartConversation = (participantName: string, participantRole: string, initialMessage: string = '') => {
    const existingConv = conversations.find(c => c.participantName === participantName);
    if (existingConv) {
      setActiveConversationId(existingConv.id);
      setActiveTab('messages');
      return;
    }

    const newConvId = 'c' + Date.now();
    const newConv: Conversation = {
      id: newConvId,
      participantName,
      participantRole,
      lastMessage: initialMessage || 'Nouvelle conversation',
      lastMessageAt: Date.now(),
      unreadCount: 0
    };

    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConvId);
    setActiveTab('messages');
  };

  const handleSaveProfile = () => {
    const newProfile: TalentProfile = {
      id: userProfile?.id || Date.now().toString(),
      name: cvData.name || 'Anonyme',
      title: cvData.title || '',
      skills: cvData.skills || [],
      location: cvData.location || '',
      bio: cvData.bio || '',
      email: cvData.email,
      phone: cvData.phone,
      experiences: cvData.experiences,
      educations: cvData.educations
    };
    setUserProfile(newProfile);
    
    setTalents(prev => {
      const exists = prev.find(t => t.id === newProfile.id);
      if (exists) {
        return prev.map(t => t.id === newProfile.id ? newProfile : t);
      }
      return [newProfile, ...prev];
    });
    
    alert("Profil sauvegardé avec succès !");
  };

  const handleGenerateCV = async () => {
    if (!cvData.name || !cvData.title) return;
    setIsGeneratingCV(true);
    try {
      const markdown = await generateCV(cvData as TalentProfile);
      setGeneratedCV(markdown);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingCV(false);
    }
  };
  // Extract all unique skills for suggestions
  const allSkills = Array.from(new Set([
    ...jobOffers.flatMap(job => job.requiredSkills || []),
    ...talents.flatMap(talent => talent.skills || [])
  ]));

  const currentSkillSearch = skillsInput.split(',').pop()?.trim().toLowerCase() || '';
  const skillSuggestions = currentSkillSearch 
    ? allSkills.filter(s => s.toLowerCase().includes(currentSkillSearch) && !skillsInput.toLowerCase().includes(s.toLowerCase()))
    : [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleApply = (jobId: string) => {
    if (!userProfile) {
      setActiveTab('bot');
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Veuillez d'abord créer votre profil en m'envoyant vos informations (ex: 'Profil: Je suis développeur...').",
        sender: 'bot',
        timestamp: Date.now()
      }]);
      return;
    }

    const newApp: Application = {
      id: Date.now().toString(),
      jobId,
      userId: userProfile.id,
      status: 'En attente',
      appliedAt: Date.now()
    };
    setApplications(prev => [newApp, ...prev]);
    
    // Notify via bot
    const job = jobOffers.find(j => j.id === jobId);
    if (job) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `🚀 Candidature envoyée ! Votre profil a été transmis à ${job.company} pour le poste de ${job.title}. Vous pouvez suivre l'état dans l'onglet 'Mes candidatures'.`,
        sender: 'bot',
        timestamp: Date.now()
      }]);
      setActiveTab('bot');
    }
  };

  const handleAddJob = () => {
    if (!newJob.title || !newJob.location || !newJob.company) return;
    const job: JobOffer = { 
      ...(newJob as JobOffer), 
      id: Date.now().toString(), 
      postedAt: newJob.postedAt || Date.now() 
    };
    setJobOffers(prev => [job, ...prev]);
    setNewJob({ title: '', company: '', location: '', contract: 'CDI', sector: '', description: '', requiredSkills: [], postedAt: Date.now() });
    setSkillsInput('');
    
    // Simulate real-time notification in bot for general broadcast
    const botMsg: Message = {
      id: Date.now().toString(),
      text: `📢 NOUVELLE OFFRE : ${job.title} chez ${job.company} à ${job.location} vient d'être publiée !`,
      sender: 'bot',
      timestamp: Date.now(),
    };
    
    // Check against saved alerts
    const triggeredAlerts = alerts.filter(alert => {
      const matchesKeyword = !alert.keywords || alert.keywords.length === 0 || 
        alert.keywords.some(kw => job.title.toLowerCase().includes(kw.toLowerCase()) || job.description.toLowerCase().includes(kw.toLowerCase()));
      const matchesLocation = !alert.location || job.location.toLowerCase().includes(alert.location.toLowerCase());
      const matchesContract = !alert.contractType || job.contract.toLowerCase() === alert.contractType.toLowerCase();
      const matchesSector = !alert.sector || job.sector.toLowerCase().includes(alert.sector.toLowerCase());
      
      return matchesKeyword && matchesLocation && matchesContract && matchesSector;
    });

    const newMessages = [botMsg];
    
    if (triggeredAlerts.length > 0) {
      newMessages.push({
        id: (Date.now() + 1).toString(),
        text: `🔔 ALERTE EMPLOI : Une nouvelle offre correspond à vos critères !\n\n💼 Poste : ${job.title}\n🏢 Entreprise : ${job.company}\n📍 Lieu : ${job.location}\n📄 Contrat : ${job.contract}\n\nTapez 'Postuler: ${job.id}' pour envoyer votre profil.`,
        sender: 'bot',
        timestamp: Date.now() + 100,
      });

      const emailAlerts = triggeredAlerts.filter(a => a.email);
      if (emailAlerts.length > 0) {
        const emails = emailAlerts.map(a => a.email).join(', ');
        newMessages.push({
          id: (Date.now() + 2).toString(),
          text: `📧 [Simulation Email] Un email d'alerte a été envoyé à : ${emails}\n\nSujet: Nouvelle offre - ${job.title}\nContenu: Une nouvelle offre chez ${job.company} correspond à vos critères.`,
          sender: 'bot',
          timestamp: Date.now() + 200,
        });
      }
    }

    setMessages(prev => [...prev, ...newMessages]);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (input.toLowerCase() === 'aide') {
      const helpMsg: Message = {
        id: Date.now().toString(),
        text: "Commandes disponibles :\n- 'Profil: [vos infos]' (ex: Profil: Je suis électricien)\n- 'Recherche: [votre besoin]' (ex: Recherche: Stage à Ouaga)\n- 'Générer mon CV' pour créer votre CV pro.\n- 'Postuler: [ID]' pour envoyer votre profil.",
        sender: 'bot',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, helpMsg]);
      setIsLoading(false);
      return;
    }

    try {
      const intent = await classifyIntent(input);
      let data = null;
      let botResponseText = "";
      let isCV = false;

      if (intent === "SEARCH") {
        data = await parseSearchCriteria(input);
      } else if (intent === "ALERT") {
        data = await parseSearchCriteria(input);
        const newAlert: JobAlert = {
          id: Date.now().toString(),
          keywords: data.keywords || [],
          location: data.location,
          contractType: data.contractType,
          sector: data.sector,
          email: data.email
        };
        setAlerts(prev => [...prev, newAlert]);
        
        const methods = [];
        if (data.email) methods.push(`un email à ${data.email}`);
        methods.push("un message WhatsApp");
        
        botResponseText = `🔔 Alerte activée avec succès ! Vous recevrez ${methods.join(' et ')} dès qu'une offre correspondant à vos critères (${data.keywords?.join(', ') || 'tout'}, ${data.location || 'partout'}) sera publiée.`;
      } else if (intent === "PROFILE") {
        data = await parseUserProfile(input);
        const newTalent: TalentProfile = {
          id: Date.now().toString(),
          name: data.name || 'Anonyme',
          title: data.bio?.split('.')[0] || 'Nouveau Talent',
          skills: data.skills || [],
          location: data.location || 'Burkina Faso',
          bio: data.bio || ''
        };
        setUserProfile(newTalent);
        setTalents(prev => [newTalent, ...prev]);
      } else if (intent === "APPLY") {
        const jobIdMatch = input.match(/postuler:\s*(\d+)/i);
        const jobId = jobIdMatch ? jobIdMatch[1] : null;
        
        if (!userProfile) {
          botResponseText = "Veuillez d'abord créer votre profil en m'envoyant vos informations (ex: 'Profil: Je suis développeur...').";
        } else if (!jobId || !jobOffers.find(j => j.id === jobId)) {
          botResponseText = "Veuillez préciser l'ID de l'offre valide. Exemple : 'Postuler: 1'";
        } else if (applications.some(a => a.jobId === jobId && a.userId === userProfile.id)) {
          botResponseText = "Vous avez déjà postulé à cette offre !";
        } else {
          const newApp: Application = {
            id: Date.now().toString(),
            jobId,
            userId: userProfile.id,
            status: 'En attente',
            appliedAt: Date.now()
          };
          setApplications(prev => [newApp, ...prev]);
          const job = jobOffers.find(j => j.id === jobId);
          botResponseText = `🚀 Candidature envoyée ! Votre profil a été transmis à ${job?.company} pour le poste de ${job?.title}. Vous pouvez suivre l'état dans l'onglet 'Mes candidatures'.`;
        }
      } else if (intent === "CV_GENERATE") {
        if (!userProfile) {
          botResponseText = "Désolé, je n'ai pas encore votre profil. Envoyez 'Profil: [vos infos]' d'abord !";
        } else {
          botResponseText = await generateCV(userProfile);
          isCV = true;
        }
      }

      if (!botResponseText) {
        const response = await fetch('/api/whatsapp/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'user123', message: input, intent, data }),
        });
        const responseData = await response.json();
        botResponseText = responseData.error || responseData.message;
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: botResponseText,
        sender: 'bot',
        timestamp: Date.now(),
        isCV
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Désolé, une erreur technique est survenue.",
        sender: 'bot',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans">
      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 w-full bg-white border-b border-slate-200 z-50 px-4 py-3 flex justify-between items-center pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#075e54] rounded-lg flex items-center justify-center text-white">
            <Globe className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-slate-800 tracking-tight">FasoJob</span>
        </div>
        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      {/* Sidebar / Bottom Navigation */}
      <nav className="fixed bottom-0 md:top-0 left-0 w-full md:w-64 h-16 md:h-full bg-white border-t md:border-t-0 md:border-r border-slate-200 flex flex-row md:flex-col z-50 pb-safe">
        <div className="hidden md:flex p-6 items-center gap-3">
          <div className="w-10 h-10 bg-[#075e54] rounded-xl flex items-center justify-center text-white">
            <Globe className="w-6 h-6" />
          </div>
          <span className="font-bold text-xl text-slate-800 tracking-tight">FasoJob</span>
        </div>

        <div className="flex-1 flex flex-row md:flex-col px-2 md:px-3 space-x-2 md:space-x-0 md:space-y-2 mt-0 md:mt-4 overflow-x-auto md:overflow-visible items-center md:items-stretch hide-scrollbar">
          <NavItem 
            active={activeTab === 'home'} 
            onClick={() => setActiveTab('home')} 
            icon={<LayoutDashboard className="w-5 h-5" />} 
            label="Accueil" 
          />
          <NavItem 
            active={activeTab === 'network'} 
            onClick={() => setActiveTab('network')} 
            icon={<Users className="w-5 h-5" />} 
            label="Réseau" 
          />
          <NavItem 
            active={activeTab === 'jobs'} 
            onClick={() => setActiveTab('jobs')} 
            icon={<Briefcase className="w-5 h-5" />} 
            label="Offres d'emploi et stage" 
          />
          <NavItem 
            active={activeTab === 'talents'} 
            onClick={() => setActiveTab('talents')} 
            icon={<Users className="w-5 h-5" />} 
            label="Talents" 
          />
          <NavItem 
            active={activeTab === 'applications'} 
            onClick={() => setActiveTab('applications')} 
            icon={<FileText className="w-5 h-5" />} 
            label="Mes candidatures" 
          />
          <NavItem 
            active={activeTab === 'messages'} 
            onClick={() => setActiveTab('messages')} 
            icon={<MessageCircle className="w-5 h-5" />} 
            label="Messagerie" 
          />
          <NavItem 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')} 
            icon={<User className="w-5 h-5" />} 
            label="Mon Profil" 
          />
          <NavItem 
            active={activeTab === 'learning'} 
            onClick={() => setActiveTab('learning')} 
            icon={<GraduationCap className="w-5 h-5" />} 
            label="Formations" 
          />
          <NavItem 
            active={activeTab === 'resources'} 
            onClick={() => setActiveTab('resources')} 
            icon={<BookOpen className="w-5 h-5" />} 
            label="Conseils Carrière" 
          />
          <NavItem 
            active={activeTab === 'recruiter'} 
            onClick={() => setActiveTab('recruiter')} 
            icon={<Building2 className="w-5 h-5" />} 
            label="Espace Entreprise" 
          />
          <div className="hidden md:block pt-4 mt-4 border-t border-slate-100">
            <NavItem 
              active={activeTab === 'bot'} 
              onClick={() => setActiveTab('bot')} 
              icon={<MessageSquare className="w-5 h-5" />} 
              label="Bot WhatsApp" 
              highlight
            />
          </div>
        </div>

        <div className="hidden md:block p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-slate-500" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-800 truncate">{userProfile?.name || 'Invité'}</p>
              <p className="text-[10px] text-slate-500 truncate">Voir mon profil</p>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pt-8 md:pb-8 md:ml-64 px-4 md:px-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto space-y-8"
            >
              <div className="bg-gradient-to-br from-[#075e54] to-[#128c7e] rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
                <div className="relative z-10 max-w-2xl">
                  <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                    Le futur de l'emploi au Burkina Faso commence ici.
                  </h1>
                  <p className="text-lg opacity-90 mb-8">
                    Connectez-vous aux meilleures opportunités locales. Que vous soyez une entreprise ou un talent, FasoJob est votre partenaire de croissance.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <button 
                      onClick={() => setActiveTab('jobs')}
                      className="bg-white text-[#075e54] px-8 py-3 rounded-full font-bold hover:bg-slate-100 transition-all shadow-lg"
                    >
                      Trouver un Job
                    </button>
                    <button 
                      onClick={() => setActiveTab('recruiter')}
                      className="bg-[#25d366] text-white px-8 py-3 rounded-full font-bold hover:bg-[#128c7e] transition-all shadow-lg"
                    >
                      Recruter des Talents
                    </button>
                  </div>
                </div>
                <Sparkles className="absolute right-10 top-10 w-32 h-32 opacity-10" />
              </div>

              <div className="flex overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 gap-4 md:gap-6 hide-scrollbar snap-x">
                <div className="min-w-[75vw] md:min-w-0 snap-center">
                  <StatCard label="Offres Actives" value={jobOffers.length.toString()} icon={<Briefcase className="text-blue-500" />} />
                </div>
                <div className="min-w-[75vw] md:min-w-0 snap-center">
                  <StatCard label="Talents Inscrits" value={talents.length.toString()} icon={<Users className="text-green-500" />} />
                </div>
                <div className="min-w-[75vw] md:min-w-0 snap-center">
                  <StatCard label="Entreprises" value={new Set(jobOffers.map(job => job.company)).size.toString()} icon={<Building2 className="text-purple-500" />} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">Dernières Offres</h2>
                    <button onClick={() => setActiveTab('jobs')} className="text-[#075e54] font-bold text-sm hover:underline">Tout voir</button>
                  </div>
                  <div className="flex overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:flex-col gap-4 hide-scrollbar snap-x">
                    {jobOffers.slice(0, 3).map(job => (
                      <div key={job.id} className="min-w-[85vw] md:min-w-0 snap-center">
                        <JobCard job={job} />
                      </div>
                    ))}
                    {jobOffers.length === 0 && (
                      <div className="w-full p-6 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500">
                        Aucune offre disponible pour le moment.
                      </div>
                    )}
                  </div>
                </section>
                <section>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">Talents à la Une</h2>
                    <button onClick={() => setActiveTab('talents')} className="text-[#075e54] font-bold text-sm hover:underline">Tout voir</button>
                  </div>
                  <div className="flex overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0 md:flex-col gap-4 hide-scrollbar snap-x">
                    {talents.slice(0, 3).map(talent => (
                      <div key={talent.id} className="min-w-[85vw] md:min-w-0 snap-center">
                        <TalentCard talent={talent} />
                      </div>
                    ))}
                    {talents.length === 0 && (
                      <div className="w-full p-6 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500">
                        Aucun talent inscrit pour le moment.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'network' && (
            <motion.div 
              key="network"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-3xl mx-auto space-y-6"
            >
              {/* Create Post */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-slate-500" />
                  </div>
                  <button className="flex-1 bg-slate-50 hover:bg-slate-100 transition-colors rounded-full px-6 text-left text-slate-500 font-medium border border-slate-200">
                    Commencer un post...
                  </button>
                </div>
              </div>

              {/* Feed Posts */}
              {[
                {
                  author: "Coris Bank International",
                  role: "Banque & Finance",
                  time: "Il y a 2 heures",
                  content: "Nous sommes fiers d'annoncer l'ouverture de notre nouvelle agence à Koudougou ! 🎉 Venez découvrir nos nouveaux services adaptés aux PME de la région. #Banque #BurkinaFaso #Développement",
                  likes: 124,
                  comments: 18,
                  isCompany: true
                },
                {
                  author: "Aminata Diallo",
                  role: "Développeuse Full-Stack",
                  time: "Il y a 5 heures",
                  content: "Je viens de terminer une formation intensive sur React et Node.js ! Je suis maintenant à la recherche de nouvelles opportunités en tant que développeuse web. N'hésitez pas à me contacter. 🚀💻",
                  likes: 45,
                  comments: 5,
                  isCompany: false
                }
              ].map((post, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${post.isCompany ? 'bg-[#075e54] text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {post.isCompany ? <Building2 className="w-6 h-6" /> : <User className="w-6 h-6" />}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800">{post.author}</h3>
                          <p className="text-xs text-slate-500">{post.role}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{post.time}</p>
                        </div>
                      </div>
                      <button className="text-slate-400 hover:text-slate-600">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-slate-700 text-sm leading-relaxed mb-4">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-500 border-b border-slate-100 pb-3 mb-3">
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-500 fill-red-500" /> {post.likes}</span>
                      <span>{post.comments} commentaires</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                        <Heart className="w-5 h-5" /> J'aime
                      </button>
                      <button className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                        <MessageSquare className="w-5 h-5" /> Commenter
                      </button>
                      <button className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                        <Share2 className="w-5 h-5" /> Partager
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === 'jobs' && (
            <motion.div 
              key="jobs"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-4xl mx-auto"
            >
              <div className="flex flex-col mb-8 gap-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-800">Offres d'emploi et stage</h2>
                    <p className="text-slate-500">Découvrez les opportunités qui vous attendent.</p>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        placeholder="Poste, entreprise..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#075e54] outline-none"
                      />
                    </div>
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={cn(
                        "p-2 border rounded-lg transition-colors flex items-center gap-2 text-sm font-medium",
                        showFilters ? "bg-[#075e54] text-white border-[#075e54]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <Filter className="w-4 h-4" />
                      <span className="hidden sm:inline">Filtres</span>
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expérience</label>
                          <select 
                            value={filterExperience}
                            onChange={(e) => setFilterExperience(e.target.value)}
                            className="w-full p-2 border border-slate-100 rounded-lg text-xs outline-none bg-slate-50"
                          >
                            <option value="Tous">Tous les niveaux</option>
                            <option value="Junior">Junior</option>
                            <option value="Intermédiaire">Intermédiaire</option>
                            <option value="Senior">Senior</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contrat</label>
                          <select 
                            value={filterContract}
                            onChange={(e) => setFilterContract(e.target.value)}
                            className="w-full p-2 border border-slate-100 rounded-lg text-xs outline-none bg-slate-50"
                          >
                            <option value="Tous">Tous les contrats</option>
                            <option value="CDI">CDI</option>
                            <option value="CDD">CDD</option>
                            <option value="Stage">Stage</option>
                            <option value="Apprentissage">Apprentissage</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Compétence</label>
                          <input 
                            placeholder="ex: React, Cuisine..."
                            value={filterSkill}
                            onChange={(e) => setFilterSkill(e.target.value)}
                            className="w-full p-2 border border-slate-100 rounded-lg text-xs outline-none bg-slate-50"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-4">
                {userProfile && filteredJobs.length > 0 && (
                  <div className="bg-blue-50 text-blue-700 text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Les offres sont triées par pertinence avec votre profil.
                  </div>
                )}
                {filteredJobs.length > 0 ? (
                  filteredJobs.map(job => (
                    <JobCard 
                      key={job.id} 
                      job={job} 
                      full 
                      matchScore={job.matchScore}
                      hasApplied={applications.some(a => a.jobId === job.id && a.userId === userProfile?.id)}
                      onApply={() => handleApply(job.id)}
                      onContact={() => handleStartConversation(job.company, 'Recruteur', `Bonjour, je suis intéressé(e) par votre offre de ${job.title}.`)}
                      onSkillClick={(skill) => {
                        setFilterSkill(skill);
                        setShowFilters(true);
                      }}
                    />
                  ))
                ) : (
                  <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                    <Search className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">Aucune offre ne correspond à vos critères.</p>
                    <button 
                      onClick={() => { setSearchQuery(''); setFilterExperience('Tous'); setFilterContract('Tous'); setFilterSkill(''); }}
                      className="mt-4 text-[#075e54] text-sm font-bold hover:underline"
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'talents' && (
            <motion.div 
              key="talents"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Vivier de Talents</h2>
                <p className="text-slate-500">Les meilleurs profils du Burkina Faso.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {talents.map(talent => (
                  <TalentCard 
                    key={talent.id} 
                    talent={talent} 
                    full 
                    onContact={() => handleStartConversation(talent.name, talent.title, `Bonjour ${talent.name}, votre profil m'intéresse.`)}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'applications' && (
            <motion.div 
              key="applications"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Mes candidatures</h2>
                <p className="text-slate-500">Suivez l'état de vos postulations en temps réel.</p>
              </div>
              
              {!userProfile ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                  <User className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">Vous n'avez pas encore de profil.</p>
                  <button 
                    onClick={() => setActiveTab('bot')}
                    className="mt-4 text-[#075e54] text-sm font-bold hover:underline"
                  >
                    Créer mon profil via le bot
                  </button>
                </div>
              ) : applications.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                  <Briefcase className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">Vous n'avez postulé à aucune offre pour le moment.</p>
                  <button 
                    onClick={() => setActiveTab('jobs')}
                    className="mt-4 text-[#075e54] text-sm font-bold hover:underline"
                  >
                    Explorer les offres
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {applications.map(app => {
                    const job = jobOffers.find(j => j.id === app.jobId);
                    if (!job) return null;
                    return (
                      <div key={app.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-[#075e54]">
                            <Building2 className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-800">{job.title}</h3>
                            <p className="text-sm text-slate-600">{job.company} • {job.location}</p>
                            <p className="text-[10px] text-slate-400 mt-1">Postulé le {new Date(app.appliedAt).toLocaleDateString('fr-FR')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "text-xs font-bold px-3 py-1.5 rounded-lg",
                            app.status === 'En attente' ? "bg-yellow-50 text-yellow-600" :
                            app.status === 'Acceptée' ? "bg-green-50 text-green-600" :
                            "bg-red-50 text-red-600"
                          )}>
                            {app.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'messages' && (
            <motion.div 
              key="messages"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-6xl mx-auto h-[calc(100vh-120px)] md:h-[calc(100vh-64px)] flex flex-col md:flex-row gap-6"
            >
              <div className="w-full md:w-1/3 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="text-2xl font-bold text-slate-800">Messagerie</h2>
                  <p className="text-sm text-slate-500">Vos conversations</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {conversations.map(conv => (
                    <div 
                      key={conv.id}
                      onClick={() => setActiveConversationId(conv.id)}
                      className={cn(
                        "p-4 border-b border-slate-50 cursor-pointer transition-colors hover:bg-slate-50",
                        activeConversationId === conv.id ? "bg-slate-50 border-l-4 border-l-[#075e54]" : ""
                      )}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-slate-800 text-sm">{conv.participantName}</h3>
                        <span className="text-[10px] text-slate-400">
                          {new Date(conv.lastMessageAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-[#075e54] font-medium mb-1">{conv.participantRole}</p>
                      <p className="text-xs text-slate-500 truncate">{conv.lastMessage}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-2/3 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
                {activeConversationId ? (
                  <>
                    <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50">
                      <div className="w-10 h-10 bg-[#075e54] rounded-full flex items-center justify-center text-white font-bold">
                        {conversations.find(c => c.id === activeConversationId)?.participantName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">
                          {conversations.find(c => c.id === activeConversationId)?.participantName}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {conversations.find(c => c.id === activeConversationId)?.participantRole}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[#f8fafc]">
                      {chatMessages.filter(m => m.conversationId === activeConversationId).map(msg => {
                        const isMe = msg.senderId === (userProfile?.id || 'user');
                        return (
                          <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                            <div className={cn(
                              "max-w-[75%] rounded-2xl p-4 shadow-sm",
                              isMe ? "bg-[#075e54] text-white rounded-tr-none" : "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                            )}>
                              <p className="text-sm leading-relaxed">{msg.text}</p>
                              <span className={cn(
                                "text-[10px] block mt-2",
                                isMe ? "text-slate-200" : "text-slate-400"
                              )}>
                                {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-4 bg-white border-t border-slate-100">
                      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-full border border-slate-200">
                        <input 
                          type="text"
                          value={newChatMessage}
                          onChange={(e) => setNewChatMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                          placeholder="Écrivez votre message..."
                          className="flex-1 bg-transparent outline-none px-4 text-sm text-slate-700"
                        />
                        <button 
                          onClick={handleSendChatMessage}
                          disabled={!newChatMessage.trim()}
                          className="w-10 h-10 bg-[#075e54] rounded-full flex items-center justify-center text-white hover:bg-[#128c7e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                    <MessageCircle className="w-16 h-16 mb-4 opacity-20" />
                    <p>Sélectionnez une conversation pour commencer à discuter.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'recruiter' && (
            <motion.div 
              key="recruiter"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-3xl mx-auto"
            >
              <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
                <h2 className="text-3xl font-bold text-slate-800 mb-8 flex items-center gap-3">
                  <Building2 className="w-8 h-8 text-[#075e54]" />
                  Espace Entreprise
                </h2>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputGroup label="Titre du Poste" value={newJob.title} onChange={v => setNewJob({...newJob, title: v})} placeholder="ex: Comptable Senior" />
                    <InputGroup label="Entreprise" value={newJob.company} onChange={v => setNewJob({...newJob, company: v})} placeholder="ex: Orange Burkina" />
                    <InputGroup label="Ville" value={newJob.location} onChange={v => setNewJob({...newJob, location: v})} placeholder="ex: Ouagadougou" />
                    <InputGroup label="Fourchette Salariale" value={newJob.salaryRange} onChange={v => setNewJob({...newJob, salaryRange: v})} placeholder="ex: 200,000 - 300,000 FCFA" />
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Type de Contrat</label>
                      <select 
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        value={newJob.contract}
                        onChange={e => setNewJob({...newJob, contract: e.target.value as any})}
                      >
                        <option value="CDI">CDI</option>
                        <option value="CDD">CDD</option>
                        <option value="Stage">Stage</option>
                        <option value="Apprentissage">Apprentissage</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Niveau d'Expérience</label>
                      <select 
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        value={newJob.experienceLevel}
                        onChange={e => setNewJob({...newJob, experienceLevel: e.target.value as any})}
                      >
                        <option value="Junior">Junior</option>
                        <option value="Intermédiaire">Intermédiaire</option>
                        <option value="Senior">Senior</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Date de publication</label>
                      <input 
                        type="date"
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        value={newJob.postedAt ? new Date(newJob.postedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                        onChange={e => {
                          const date = e.target.value ? new Date(e.target.value).getTime() : Date.now();
                          setNewJob({...newJob, postedAt: date});
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">Date limite de candidature</label>
                      <input 
                        type="date"
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        value={newJob.deadline ? new Date(newJob.deadline).toISOString().split('T')[0] : ''}
                        onChange={e => {
                          const date = e.target.value ? new Date(e.target.value).getTime() : undefined;
                          setNewJob({...newJob, deadline: date});
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 relative">
                    <label className="text-sm font-bold text-slate-700">Compétences Requises (séparées par des virgules)</label>
                    <input 
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                      placeholder="ex: React, SQL, Management"
                      value={skillsInput}
                      onChange={e => {
                        setSkillsInput(e.target.value);
                        setNewJob({...newJob, requiredSkills: e.target.value.split(',').map(s => s.trim()).filter(Boolean)});
                        setShowSkillSuggestions(true);
                      }}
                      onFocus={() => setShowSkillSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSkillSuggestions(false), 200)}
                    />
                    {showSkillSuggestions && skillSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {skillSuggestions.map(skill => (
                          <div 
                            key={skill}
                            className="p-3 hover:bg-slate-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0"
                            onClick={() => {
                              const parts = skillsInput.split(',');
                              parts.pop(); // remove the partial typing
                              const newVal = parts.length > 0 ? parts.join(',') + ', ' + skill + ', ' : skill + ', ';
                              setSkillsInput(newVal);
                              setNewJob({...newJob, requiredSkills: newVal.split(',').map(s => s.trim()).filter(Boolean)});
                              setShowSkillSuggestions(false);
                            }}
                          >
                            {skill}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Description</label>
                    <textarea 
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54] h-32"
                      placeholder="Détails de l'offre..."
                      value={newJob.description}
                      onChange={e => setNewJob({...newJob, description: e.target.value})}
                    />
                  </div>
                  <button 
                    onClick={handleAddJob}
                    className="w-full bg-[#075e54] text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Plus className="w-6 h-6" />
                    Publier l'Offre
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-6xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Mon Profil</h2>
                <p className="text-slate-500">Gérez vos informations personnelles et visualisez votre CV généré en temps réel.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Formulaire */}
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <User className="w-5 h-5 text-[#075e54]" /> Vos Informations
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Nom complet</label>
                      <input 
                        type="text"
                        value={cvData.name}
                        onChange={e => setCvData({...cvData, name: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        placeholder="Ex: Aminata Diallo"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Titre professionnel</label>
                      <input 
                        type="text"
                        value={cvData.title}
                        onChange={e => setCvData({...cvData, title: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        placeholder="Ex: Développeuse Full-Stack"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                        <input 
                          type="email"
                          value={cvData.email}
                          onChange={e => setCvData({...cvData, email: e.target.value})}
                          className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                          placeholder="Ex: aminata@email.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Téléphone</label>
                        <input 
                          type="tel"
                          value={cvData.phone}
                          onChange={e => setCvData({...cvData, phone: e.target.value})}
                          className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                          placeholder="Ex: +226 70 00 00 00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Localisation</label>
                      <input 
                        type="text"
                        value={cvData.location}
                        onChange={e => setCvData({...cvData, location: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        placeholder="Ex: Ouagadougou"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Compétences (séparées par des virgules)</label>
                      <input 
                        type="text"
                        value={cvData.skills?.join(', ')}
                        onChange={e => setCvData({...cvData, skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54]"
                        placeholder="Ex: React, Node.js, Gestion de projet..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Biographie</label>
                      <textarea 
                        value={cvData.bio}
                        onChange={e => setCvData({...cvData, bio: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54] h-24"
                        placeholder="Décrivez brièvement votre profil..."
                      />
                    </div>

                    {/* Expériences */}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-slate-700">Expériences</label>
                        <button 
                          onClick={() => setCvData({
                            ...cvData, 
                            experiences: [...(cvData.experiences || []), { id: Date.now().toString(), title: '', company: '', startDate: '', endDate: '', description: '' }]
                          })}
                          className="text-xs text-[#075e54] font-bold hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Ajouter
                        </button>
                      </div>
                      <div className="space-y-3">
                        {cvData.experiences?.map((exp, index) => (
                          <div key={exp.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 relative">
                            <button 
                              onClick={() => setCvData({...cvData, experiences: cvData.experiences.filter(e => e.id !== exp.id)})}
                              className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                            >✕</button>
                            <input 
                              type="text" placeholder="Poste (ex: Développeur)" value={exp.title}
                              onChange={e => {
                                const newExp = [...cvData.experiences];
                                newExp[index].title = e.target.value;
                                setCvData({...cvData, experiences: newExp});
                              }}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                            />
                            <input 
                              type="text" placeholder="Entreprise" value={exp.company}
                              onChange={e => {
                                const newExp = [...cvData.experiences];
                                newExp[index].company = e.target.value;
                                setCvData({...cvData, experiences: newExp});
                              }}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                            />
                            <div className="flex gap-2">
                              <input 
                                type="text" placeholder="Début (ex: 2020)" value={exp.startDate}
                                onChange={e => {
                                  const newExp = [...cvData.experiences];
                                  newExp[index].startDate = e.target.value;
                                  setCvData({...cvData, experiences: newExp});
                                }}
                                className="w-1/2 p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                              />
                              <input 
                                type="text" placeholder="Fin (ex: 2023)" value={exp.endDate}
                                onChange={e => {
                                  const newExp = [...cvData.experiences];
                                  newExp[index].endDate = e.target.value;
                                  setCvData({...cvData, experiences: newExp});
                                }}
                                className="w-1/2 p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                              />
                            </div>
                            <textarea 
                              placeholder="Description des missions..." value={exp.description}
                              onChange={e => {
                                const newExp = [...cvData.experiences];
                                newExp[index].description = e.target.value;
                                setCvData({...cvData, experiences: newExp});
                              }}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54] h-16"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Formations */}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-slate-700">Formations</label>
                        <button 
                          onClick={() => setCvData({
                            ...cvData, 
                            educations: [...(cvData.educations || []), { id: Date.now().toString(), degree: '', school: '', startDate: '', endDate: '' }]
                          })}
                          className="text-xs text-[#075e54] font-bold hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Ajouter
                        </button>
                      </div>
                      <div className="space-y-3">
                        {cvData.educations?.map((edu, index) => (
                          <div key={edu.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 relative">
                            <button 
                              onClick={() => setCvData({...cvData, educations: cvData.educations.filter(e => e.id !== edu.id)})}
                              className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                            >✕</button>
                            <input 
                              type="text" placeholder="Diplôme (ex: Master IT)" value={edu.degree}
                              onChange={e => {
                                const newEdu = [...cvData.educations];
                                newEdu[index].degree = e.target.value;
                                setCvData({...cvData, educations: newEdu});
                              }}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                            />
                            <input 
                              type="text" placeholder="École / Université" value={edu.school}
                              onChange={e => {
                                const newEdu = [...cvData.educations];
                                newEdu[index].school = e.target.value;
                                setCvData({...cvData, educations: newEdu});
                              }}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                            />
                            <div className="flex gap-2">
                              <input 
                                type="text" placeholder="Début (ex: 2018)" value={edu.startDate}
                                onChange={e => {
                                  const newEdu = [...cvData.educations];
                                  newEdu[index].startDate = e.target.value;
                                  setCvData({...cvData, educations: newEdu});
                                }}
                                className="w-1/2 p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                              />
                              <input 
                                type="text" placeholder="Fin (ex: 2020)" value={edu.endDate}
                                onChange={e => {
                                  const newEdu = [...cvData.educations];
                                  newEdu[index].endDate = e.target.value;
                                  setCvData({...cvData, educations: newEdu});
                                }}
                                className="w-1/2 p-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#075e54]"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={handleSaveProfile}
                      className="w-full bg-[#075e54] text-white py-3 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <CheckCircle2 className="w-5 h-5" /> Sauvegarder mon profil
                    </button>
                    <button 
                      onClick={handleGenerateCV}
                      disabled={isGeneratingCV || !cvData.name || !cvData.title}
                      className="w-full bg-slate-100 text-slate-700 py-3 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingCV ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Génération en cours...</>
                      ) : (
                        <><Sparkles className="w-5 h-5" /> Améliorer mon CV avec l'IA</>
                      )}
                    </button>
                    <p className="text-xs text-slate-500 text-center">
                      Sauvegardez votre profil pour postuler aux offres, ou laissez l'IA optimiser votre CV.
                    </p>
                  </div>
                </div>

                {/* Aperçu du CV */}
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 h-[800px] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-[#075e54]" /> Aperçu du CV
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <select 
                          value={cvLayout} 
                          onChange={e => setCvLayout(e.target.value as any)}
                          className="text-xs border border-slate-200 rounded-lg p-1 outline-none"
                        >
                          <option value="modern">Moderne</option>
                          <option value="classic">Classique</option>
                        </select>
                        <select 
                          value={cvFont} 
                          onChange={e => setCvFont(e.target.value as any)}
                          className="text-xs border border-slate-200 rounded-lg p-1 outline-none"
                        >
                          <option value="sans">Sans-serif</option>
                          <option value="serif">Serif</option>
                          <option value="mono">Monospace</option>
                        </select>
                        <div className="flex gap-1 ml-2">
                          {['#075e54', '#2563eb', '#dc2626', '#16a34a', '#475569'].map(color => (
                            <button
                              key={color}
                              onClick={() => setCvColor(color)}
                              className={`w-5 h-5 rounded-full border-2 ${cvColor === color ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                      {generatedCV || cvData.name ? (
                        <button onClick={handleDownloadPDF} className="bg-white text-[#075e54] border border-[#075e54] px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-[#075e54] hover:text-white transition-all flex items-center gap-2">
                          <Download className="w-4 h-4" /> PDF
                        </button>
                      ) : null}
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-8 overflow-y-auto custom-scrollbar" ref={cvPreviewRef}>
                    {generatedCV ? (
                      <div className="markdown-body prose prose-sm max-w-none">
                        <ReactMarkdown>{generatedCV}</ReactMarkdown>
                      </div>
                    ) : cvData.name || cvData.title ? (
                      <div className={`text-slate-800 font-${cvFont} ${cvLayout === 'classic' ? 'text-center' : ''}`}>
                        <h1 className={`text-3xl font-bold uppercase tracking-wider mb-1 ${cvLayout === 'classic' ? 'border-b-2 pb-2 inline-block' : ''}`} style={{ color: cvColor, borderColor: cvColor }}>{cvData.name || 'Votre Nom'}</h1>
                        <h2 className="text-xl font-medium text-slate-600 mb-4">{cvData.title || 'Votre Titre'}</h2>
                        
                        <div className={`flex flex-wrap gap-4 text-xs text-slate-500 mb-6 pb-4 border-b border-slate-200 ${cvLayout === 'classic' ? 'justify-center' : ''}`}>
                          {cvData.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {cvData.location}</span>}
                          {cvData.email && <span className="flex items-center gap-1">✉️ {cvData.email}</span>}
                          {cvData.phone && <span className="flex items-center gap-1">📞 {cvData.phone}</span>}
                        </div>

                        {cvData.bio && (
                          <div className={`mb-6 ${cvLayout === 'classic' ? 'text-left' : ''}`}>
                            <h3 className={`text-sm font-bold uppercase tracking-wider mb-2 pb-1 ${cvLayout === 'classic' ? 'border-b-2' : 'border-b border-slate-100'}`} style={{ color: cvColor, borderColor: cvLayout === 'classic' ? cvColor : '' }}>Profil</h3>
                            <p className="text-sm text-slate-700 leading-relaxed">{cvData.bio}</p>
                          </div>
                        )}

                        {cvData.experiences && cvData.experiences.length > 0 && (
                          <div className={`mb-6 ${cvLayout === 'classic' ? 'text-left' : ''}`}>
                            <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 pb-1 ${cvLayout === 'classic' ? 'border-b-2' : 'border-b border-slate-100'}`} style={{ color: cvColor, borderColor: cvLayout === 'classic' ? cvColor : '' }}>Expériences Professionnelles</h3>
                            <div className="space-y-4">
                              {cvData.experiences.map(exp => (
                                <div key={exp.id}>
                                  <div className="flex justify-between items-baseline mb-1">
                                    <h4 className="font-bold text-slate-800">{exp.title}</h4>
                                    <span className="text-xs text-slate-500 font-medium">{exp.startDate} - {exp.endDate}</span>
                                  </div>
                                  <p className="text-sm font-medium mb-1" style={{ color: cvColor }}>{exp.company}</p>
                                  <p className="text-sm text-slate-600">{exp.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {cvData.educations && cvData.educations.length > 0 && (
                          <div className={`mb-6 ${cvLayout === 'classic' ? 'text-left' : ''}`}>
                            <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 pb-1 ${cvLayout === 'classic' ? 'border-b-2' : 'border-b border-slate-100'}`} style={{ color: cvColor, borderColor: cvLayout === 'classic' ? cvColor : '' }}>Formation</h3>
                            <div className="space-y-4">
                              {cvData.educations.map(edu => (
                                <div key={edu.id}>
                                  <div className="flex justify-between items-baseline mb-1">
                                    <h4 className="font-bold text-slate-800">{edu.degree}</h4>
                                    <span className="text-xs text-slate-500 font-medium">{edu.startDate} - {edu.endDate}</span>
                                  </div>
                                  <p className="text-sm text-slate-600">{edu.school}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {cvData.skills && cvData.skills.length > 0 && (
                          <div className={`${cvLayout === 'classic' ? 'text-left' : ''}`}>
                            <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 pb-1 ${cvLayout === 'classic' ? 'border-b-2' : 'border-b border-slate-100'}`} style={{ color: cvColor, borderColor: cvLayout === 'classic' ? cvColor : '' }}>Compétences</h3>
                            <div className="flex flex-wrap gap-2">
                              {cvData.skills.map(skill => (
                                <span key={skill} className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-medium">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
                        <Printer className="w-16 h-16 mb-4 opacity-20" />
                        <p>Remplissez le formulaire à gauche.<br/>Votre CV se mettra à jour en temps réel ici.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'learning' && (
            <motion.div 
              key="learning"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Formations & Certifications</h2>
                <p className="text-slate-500">Développez vos compétences pour booster votre carrière.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { title: "Développement Web Full-Stack", provider: "Simplon Burkina", duration: "6 mois", level: "Débutant", price: "Gratuit (Bourse)", icon: <Globe className="w-6 h-6 text-blue-500" /> },
                  { title: "Certification PMP - Gestion de Projet", provider: "PMI Chapter BF", duration: "3 mois", level: "Avancé", price: "Payant", icon: <Award className="w-6 h-6 text-yellow-500" /> },
                  { title: "Anglais Professionnel", provider: "British Council", duration: "2 mois", level: "Tous niveaux", price: "Sur devis", icon: <MessageSquare className="w-6 h-6 text-red-500" /> },
                  { title: "Marketing Digital & Réseaux Sociaux", provider: "Digital Academy", duration: "4 semaines", level: "Intermédiaire", price: "50,000 FCFA", icon: <Sparkles className="w-6 h-6 text-purple-500" /> },
                  { title: "Maîtrise de Excel Avancé", provider: "FasoFormation", duration: "2 semaines", level: "Intermédiaire", price: "25,000 FCFA", icon: <FileText className="w-6 h-6 text-green-500" /> },
                  { title: "Design UI/UX avec Figma", provider: "TechHub Ouaga", duration: "1 mois", level: "Débutant", price: "30,000 FCFA", icon: <LayoutDashboard className="w-6 h-6 text-pink-500" /> }
                ].map((course, i) => (
                  <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group cursor-pointer">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      {course.icon}
                    </div>
                    <h3 className="font-bold text-lg text-slate-800 mb-2 group-hover:text-[#075e54] transition-colors">{course.title}</h3>
                    <p className="text-sm text-slate-600 mb-4">{course.provider}</p>
                    <div className="flex flex-wrap gap-2 mb-6">
                      <span className="flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-1 rounded-full text-slate-600 font-medium">
                        <Clock className="w-3 h-3" /> {course.duration}
                      </span>
                      <span className="text-[10px] bg-blue-50 px-2 py-1 rounded-full text-blue-600 font-bold">
                        {course.level}
                      </span>
                      <span className="text-[10px] bg-green-50 px-2 py-1 rounded-full text-green-600 font-bold">
                        {course.price}
                      </span>
                    </div>
                    <button 
                      className="w-full bg-slate-50 text-slate-700 py-2.5 rounded-xl text-sm font-bold group-hover:bg-[#075e54] group-hover:text-white transition-colors flex items-center justify-center gap-2"
                      onClick={() => setSelectedCourse(course)}
                    >
                      <PlayCircle className="w-4 h-4" />
                      Voir le programme
                    </button>
                  </div>
                ))}
              </div>

              {/* Course Modal */}
              <AnimatePresence>
                {selectedCourse && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative"
                    >
                      <button 
                        onClick={() => setSelectedCourse(null)}
                        className="absolute top-4 right-4 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                      >
                        ✕
                      </button>
                      
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center">
                          {selectedCourse.icon}
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-slate-800">{selectedCourse.title}</h3>
                          <p className="text-[#075e54] font-medium">{selectedCourse.provider}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Durée</p>
                          <p className="font-medium text-slate-800">{selectedCourse.duration}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Niveau</p>
                          <p className="font-medium text-slate-800">{selectedCourse.level}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl">
                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Prix</p>
                          <p className="font-medium text-slate-800">{selectedCourse.price}</p>
                        </div>
                      </div>

                      <div className="space-y-4 mb-8">
                        <h4 className="font-bold text-slate-800">À propos de cette formation</h4>
                        <p className="text-slate-600 leading-relaxed">
                          Cette formation intensive vous permettra d'acquérir les compétences clés demandées sur le marché du travail. 
                          Vous serez accompagné par des experts du domaine et travaillerez sur des projets concrets.
                        </p>
                        <ul className="list-disc list-inside text-slate-600 space-y-2">
                          <li>Accès à vie au contenu</li>
                          <li>Certificat de réussite inclus</li>
                          <li>Mentorat personnalisé</li>
                        </ul>
                      </div>

                      <button 
                        onClick={() => {
                          alert("Inscription simulée avec succès !");
                          setSelectedCourse(null);
                        }}
                        className="w-full bg-[#075e54] text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg"
                      >
                        S'inscrire maintenant
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'resources' && (
            <motion.div 
              key="resources"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Ressources & Conseils</h2>
                <p className="text-slate-500">Guides, astuces et actualités du marché de l'emploi.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { title: "Comment réussir son entretien d'embauche au Burkina Faso", category: "Entretien", readTime: "5 min", image: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=800" },
                  { title: "Les 10 compétences les plus recherchées en 2026", category: "Tendances", readTime: "4 min", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800" },
                  { title: "Négocier son salaire : les erreurs à éviter", category: "Carrière", readTime: "6 min", image: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=800" },
                  { title: "Télétravail : comment bien s'organiser à la maison ?", category: "Productivité", readTime: "3 min", image: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&q=80&w=800" }
                ].map((article, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden group cursor-pointer flex flex-col md:flex-row">
                    <div className="md:w-2/5 h-48 md:h-auto relative overflow-hidden">
                      <img src={article.image} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#075e54]">
                        {article.category}
                      </div>
                    </div>
                    <div className="p-5 md:w-3/5 flex flex-col justify-center">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mb-2 font-medium">
                        <Clock className="w-3 h-3" /> {article.readTime} de lecture
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 mb-3 group-hover:text-[#075e54] transition-colors leading-tight">{article.title}</h3>
                      <button className="text-sm font-bold text-[#075e54] flex items-center gap-1 group-hover:gap-2 transition-all mt-auto w-fit">
                        Lire l'article <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'bot' && (
            <motion.div 
              key="bot"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto h-[700px] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="bg-[#075e54] p-6 flex items-center gap-4 text-white">
                <div className="w-12 h-12 bg-[#128c7e] rounded-full flex items-center justify-center">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="font-bold text-xl">FasoJob Bot</h1>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <p className="text-xs opacity-80">En ligne</p>
                  </div>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#e5ddd5] custom-scrollbar">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "max-w-[85%] p-4 rounded-2xl text-sm shadow-sm",
                        msg.sender === 'user' 
                          ? "bg-[#dcf8c6] ml-auto rounded-tr-none" 
                          : "bg-white mr-auto rounded-tl-none",
                        msg.isCV && "max-w-[95%] border-2 border-[#25d366]"
                      )}
                    >
                      {msg.isCV ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-[#075e54] border-b pb-2">
                            <FileText className="w-5 h-5" />
                            <span className="font-bold">Votre CV Professionnel</span>
                          </div>
                          <div className="markdown-body text-[11px] prose prose-sm max-w-none">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>
                          <button className="w-full mt-2 bg-[#25d366] text-white py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-bold hover:bg-[#128c7e] transition-all">
                            <Download className="w-4 h-4" />
                            Télécharger PDF
                          </button>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-2 text-right">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isLoading && (
                  <div className="bg-white p-4 rounded-2xl text-sm shadow-sm mr-auto rounded-tl-none animate-pulse">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 flex items-center gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Tapez votre message..."
                  className="flex-1 bg-white p-4 rounded-2xl text-sm outline-none shadow-sm focus:ring-2 focus:ring-[#25d366] transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="w-14 h-14 bg-[#25d366] rounded-2xl flex items-center justify-center text-white shadow-lg hover:bg-[#128c7e] transition-all disabled:bg-slate-300"
                >
                  <Send className="w-6 h-6 ml-1" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// Helper Components
function NavItem({ active, onClick, icon, label, highlight }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, highlight?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:p-3 rounded-xl transition-all group min-w-[70px] md:min-w-0 md:w-full",
        active 
          ? (highlight ? "bg-[#075e54] text-white shadow-lg" : "bg-slate-100 text-[#075e54] font-bold") 
          : "text-slate-500 hover:bg-slate-50"
      )}
    >
      <div className={cn("transition-transform group-hover:scale-110", active ? "text-inherit" : "text-slate-400")}>
        {icon}
      </div>
      <span className="text-[10px] md:text-sm text-center md:text-left leading-tight">{label}</span>
    </button>
  );
}

function StatCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-xl">
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function JobCard({ job, full, onSkillClick, matchScore, onApply, hasApplied, onContact }: { job: JobOffer, full?: boolean, onSkillClick?: (skill: string) => void, matchScore?: number, onApply?: () => void, hasApplied?: boolean, onContact?: () => void }) {
  return (
    <div className={cn(
      "bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden",
      full ? "flex flex-col md:flex-row md:items-start gap-6" : "space-y-3"
    )}>
      {matchScore !== undefined && matchScore >= 50 && full && (
        <div className="absolute top-0 right-0 bg-orange-100 text-orange-600 text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> {matchScore}% Match
        </div>
      )}
      <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center text-[#075e54] group-hover:bg-[#075e54] group-hover:text-white transition-colors shrink-0">
        <Building2 className="w-8 h-8" />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start mb-1">
          <div>
            <h3 className="font-bold text-lg text-slate-800 group-hover:text-[#075e54] transition-colors">{job.title}</h3>
            <p className="text-sm font-medium text-[#075e54] mb-3 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />
              {job.company}
            </p>
          </div>
          {job.salaryRange && (
            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg whitespace-nowrap">
              {job.salaryRange}
            </span>
          )}
        </div>
        
        {full && job.description && (
          <p className="text-sm text-slate-600 mb-4 line-clamp-3 leading-relaxed">
            {job.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-1 rounded-full text-slate-600">
            <MapPin className="w-3 h-3" /> {job.location}
          </span>
          <span className="text-[10px] bg-blue-50 px-2 py-1 rounded-full text-blue-600 font-bold">
            {job.contract}
          </span>
          <span className="text-[10px] bg-purple-50 px-2 py-1 rounded-full text-purple-600">
            {job.experienceLevel}
          </span>
        </div>
        {full && (
          <div className="flex flex-wrap gap-1.5">
            {job.requiredSkills.map(skill => (
              <button 
                key={skill} 
                onClick={(e) => {
                  e.stopPropagation();
                  onSkillClick?.(skill);
                }}
                className="text-[9px] bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-slate-500 hover:bg-[#075e54] hover:text-white hover:border-[#075e54] transition-colors cursor-pointer"
              >
                {skill}
              </button>
            ))}
          </div>
        )}
      </div>
      {full && (
        <div className="flex flex-col gap-2 shrink-0">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (!hasApplied) onApply?.();
            }}
            disabled={hasApplied}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              hasApplied 
                ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                : "bg-slate-800 text-white hover:bg-black"
            )}
          >
            {hasApplied ? "Déjà postulé" : "Postuler"}
          </button>
          {onContact && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onContact();
              }}
              className="px-6 py-2 bg-[#075e54] text-white rounded-xl text-sm font-bold hover:bg-[#128c7e] transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" /> Contacter
            </button>
          )}
          <p className="text-[10px] text-slate-400 text-center">Publié il y a {Math.floor((Date.now() - job.postedAt) / 86400000)}j</p>
          {job.deadline && (
            <p className="text-[10px] text-red-500 text-center font-medium">
              Limite : {new Date(job.deadline).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TalentCard({ talent, full, onContact }: { talent: TalentProfile, full?: boolean, onContact?: () => void }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
          <User className="w-6 h-6 text-slate-400" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">{talent.name}</h3>
          <p className="text-xs text-[#075e54] font-medium">{talent.title}</p>
        </div>
      </div>
      <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">{talent.bio}</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {talent.skills.map(skill => (
          <span key={skill} className="text-[9px] bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full text-slate-500">
            {skill}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
          Voir
        </button>
        {onContact && (
          <button onClick={onContact} className="flex-1 py-2 bg-[#075e54] text-white rounded-xl text-xs font-bold hover:bg-[#128c7e] transition-all flex items-center justify-center gap-2">
            <MessageCircle className="w-3 h-3" /> Contacter
          </button>
        )}
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, placeholder }: { label: string, value?: string, onChange: (v: string) => void, placeholder: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-slate-700">{label}</label>
      <input 
        className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#075e54] transition-all"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
