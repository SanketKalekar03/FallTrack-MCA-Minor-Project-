import React from 'react';
import { 
  Sparkles,
  Layers,
  IndianRupee,
  Calendar
} from 'lucide-react';

interface SuggestedQuestionsProps {
  onSelectQuestion: (question: string) => void;
}

export const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ onSelectQuestion }) => {
  const categories = [
    {
      title: 'Production & Colours',
      icon: Layers,
      questions: [
        'How many falls did I complete today?',
        'Show my production for yesterday.',
        'What is my total production?',
        'How many Rani falls did I complete this month?',
        'Break down my completed production by colour.'
      ]
    },
    {
      title: 'Rates & Income',
      icon: IndianRupee,
      questions: [
        'What is my current rate per dozen?',
        'What was my rate yesterday?',
        'Calculate my income for this week.',
        'Calculate my income for October 2026.',
        'How is income calculated in FallTrack?'
      ]
    },
    {
      title: 'Billing & System Help',
      icon: Calendar,
      questions: [
        'Show my latest billing period.',
        'Why can\'t I edit yesterday\'s production?',
        'How do I add a new colour?'
      ]
    }
  ];

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
        <Sparkles size={13} className="text-sky-500" />
        <span>Suggested Questions</span>
      </div>

      <div className="space-y-3">
        {categories.map((cat, idx) => {
          const Icon = cat.icon;
          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-500 px-0.5">
                <Icon size={12} className="text-sky-500" />
                <span>{cat.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.questions.map((q, qIdx) => (
                  <button
                    key={qIdx}
                    onClick={() => onSelectQuestion(q)}
                    className="text-left px-3 py-1.5 bg-white hover:bg-sky-50/80 text-slate-700 hover:text-sky-700 border border-slate-200/80 hover:border-sky-300 rounded-xl text-xs font-medium transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.98]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
