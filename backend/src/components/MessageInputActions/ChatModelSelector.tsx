'use client';

import { Check, Cpu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { useMemo, useState } from 'react';
import { useChat } from '@/lib/hooks/useChat';
import { AnimatePresence, motion } from 'motion/react';

const CLAUDE_MODELS = [
  {
    key: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Routing and fast responses',
  },
  {
    key: 'anthropic/claude-sonnet-4',
    label: 'Claude Sonnet 4',
    description: 'Default summaries and drafting',
  },
  {
    key: 'anthropic/claude-opus-4',
    label: 'Claude Opus 4',
    description: 'Deep reasoning and heavy tasks',
  },
] as const;

const ModelSelector = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const { setChatModelProvider, chatModelProvider } = useChat();

  const handleModelSelect = (modelKey: string) => {
    setChatModelProvider({ providerId: 'openrouter', key: modelKey });
    localStorage.setItem('chatModelProviderId', 'openrouter');
    localStorage.setItem('chatModelKey', modelKey);
  };

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CLAUDE_MODELS;
    return CLAUDE_MODELS.filter(
      (model) =>
        model.label.toLowerCase().includes(q) ||
        model.key.toLowerCase().includes(q) ||
        model.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const selectedModel =
    CLAUDE_MODELS.find((model) => model.key === chatModelProvider?.key) ||
    CLAUDE_MODELS[1];

  return (
    <Popover className="relative w-full max-w-[15rem] md:max-w-md lg:max-w-lg">
      {({ open }) => (
        <>
          <PopoverButton
            type="button"
            className="active:border-none hover:bg-light-200  hover:dark:bg-dark-200 p-2 rounded-lg focus:outline-none headless-open:text-black dark:headless-open:text-white text-black/50 dark:text-white/50 active:scale-95 transition duration-200 hover:text-black dark:hover:text-white"
          >
            <Cpu size={16} className="text-sky-500" />
          </PopoverButton>
          <AnimatePresence>
            {open && (
              <PopoverPanel
                className="absolute z-10 w-[230px] sm:w-[270px] md:w-[300px] right-0"
                static
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="origin-top-right bg-light-primary dark:bg-dark-primary max-h-[300px] sm:max-w-none border rounded-lg border-light-200 dark:border-dark-200 w-full flex flex-col shadow-lg overflow-hidden"
                >
                  <div className="p-2 border-b border-light-200 dark:border-dark-200">
                    <div className="relative">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40"
                      />
                      <input
                        type="text"
                        placeholder="Search models..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-light-secondary dark:bg-dark-secondary rounded-lg placeholder:text-xs placeholder:-translate-y-[1.5px] text-xs text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none border border-transparent transition duration-200"
                      />
                    </div>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto">
                    {filteredModels.length === 0 ? (
                      <div className="text-center py-16 px-4 text-black/60 dark:text-white/60 text-sm">
                        No models found
                      </div>
                    ) : (
                      <div className="flex flex-col p-2">
                        <p className="px-2 pb-2 text-[11px] uppercase tracking-wider text-black/45 dark:text-white/45">
                          Atlas Claude Stack
                        </p>
                        {filteredModels.map((model) => (
                          <button
                            key={model.key}
                            onClick={() => handleModelSelect(model.key)}
                            type="button"
                            className={cn(
                              'px-3 py-2 flex items-center justify-between text-start duration-200 cursor-pointer transition rounded-lg group',
                              selectedModel.key === model.key
                                ? 'bg-light-secondary dark:bg-dark-secondary'
                                : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'text-xs truncate',
                                  selectedModel.key === model.key
                                    ? 'text-sky-500 font-medium'
                                    : 'text-black/80 dark:text-white/80',
                                )}
                              >
                                {model.label}
                              </p>
                              <p className="text-[11px] text-black/50 dark:text-white/50 truncate">
                                {model.description}
                              </p>
                            </div>
                            {selectedModel.key === model.key && (
                              <Check size={15} className="text-sky-500 shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </PopoverPanel>
            )}
          </AnimatePresence>
        </>
      )}
    </Popover>
  );
};

export default ModelSelector;
