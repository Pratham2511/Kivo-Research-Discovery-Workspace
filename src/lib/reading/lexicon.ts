/**
 * Bundled domain glossary (FUTURE_FEATURES #11).
 *
 * Seeded from the vocabulary that actually stops students in ML/AI, methods
 * and biomedicine tracks — multi-word terms are the real barrier (a lone
 * "model" is guessable; "contrastive pretraining" is not). Glosses are
 * deliberately one sentence and jargon-free themselves.
 *
 * The lexicon is static, auditable and versioned in the repo — no model is
 * involved in detection; the AI layer only *rewrites* around terms that this
 * file already found.
 */

export interface LexiconEntry {
  term: string;
  gloss: string;
}

export const JARGON_LEXICON: LexiconEntry[] = [
  // ── Deep learning · architectures ──────────────────────────────────────
  { term: "neural network", gloss: "A model built from many simple units stacked in layers, each layer learning to transform what the previous one extracted." },
  { term: "deep neural network", gloss: "A neural network with many layers; 'deep' just means lots of them." },
  { term: "convolutional neural network", gloss: "A neural network that slides small windows over data like images, detecting local patterns wherever they appear." },
  { term: "recurrent neural network", gloss: "A neural network that processes sequences one step at a time, carrying a memory of earlier steps." },
  { term: "transformer", gloss: "The dominant modern architecture: instead of reading a sequence step by step, every token can look at every other token at once." },
  { term: "self-attention", gloss: "The mechanism that lets each part of the input weigh how much every other part matters to it — the core trick of transformers." },
  { term: "attention mechanism", gloss: "A learned weighting that decides which parts of the input the model should focus on." },
  { term: "multi-head attention", gloss: "Running several attention computations in parallel so the model can track different kinds of relationships at the same time." },
  { term: "positional encoding", gloss: "Adding information about where each token sits in the sequence, since attention alone is order-blind." },
  { term: "encoder", gloss: "The half of a model that turns raw input into a rich internal representation." },
  { term: "decoder", gloss: "The half of a model that turns an internal representation back into output, one piece at a time." },
  { term: "encoder-decoder", gloss: "An architecture pairing the two: read the input into a representation, then generate output from it." },
  { term: "autoencoder", gloss: "A network trained to squeeze its input through a small bottleneck and rebuild it — the bottleneck becomes a compact summary." },
  { term: "generative adversarial network", gloss: "Two networks in a game: a forger that fakes data and a detective that spots fakes; each improves by beating the other." },
  { term: "diffusion model", gloss: "A generator that learns by slowly adding noise to images and then reversing the process — modern image and structure generators work this way." },
  { term: "graph neural network", gloss: "A network that runs on graph-structured data (molecules, citations, road maps), passing messages along edges." },
  { term: "large language model", gloss: "A transformer trained on enormous text corpora to predict the next token, which — at scale — yields general language ability." },
  { term: "foundation model", gloss: "One giant model pretrained once, then adapted to many downstream tasks." },
  { term: "mixture of experts", gloss: "A model with many specialist sub-networks where a router sends each input to only a few of them, saving compute." },
  { term: "residual connection", gloss: "A shortcut that adds a layer's input directly to its output, which makes very deep networks trainable." },

  // ── Deep learning · training ───────────────────────────────────────────
  { term: "gradient descent", gloss: "The core optimiser: repeatedly nudge every parameter in the direction that most reduces the error." },
  { term: "stochastic gradient descent", gloss: "Gradient descent computed on small random batches of data instead of the whole dataset at once." },
  { term: "backpropagation", gloss: "The bookkeeping algorithm that works out, for every parameter, how much it contributed to the final error." },
  { term: "learning rate", gloss: "The step size used when updating parameters — too big and training diverges, too small and it crawls." },
  { term: "fine-tuning", gloss: "Taking a pretrained model and continuing training on your smaller, task-specific data." },
  { term: "pretraining", gloss: "The first, expensive training phase on a huge generic corpus, before any task-specific adaptation." },
  { term: "transfer learning", gloss: "Reusing knowledge learned on one task as the starting point for another." },
  { term: "supervised learning", gloss: "Learning from examples that come with the correct answers attached." },
  { term: "self-supervised learning", gloss: "Manufacturing the answers from the raw data itself (e.g. guess the masked word), so no human labels are needed." },
  { term: "reinforcement learning", gloss: "Learning by trial and error against rewards rather than from labelled examples." },
  { term: "contrastive learning", gloss: "Training a model to pull similar pairs close together in its representation space and push dissimilar pairs apart." },
  { term: "curriculum learning", gloss: "Ordering training from easy examples to hard ones, the way a course is sequenced." },
  { term: "knowledge distillation", gloss: "Training a small 'student' model to imitate a large 'teacher' model so the small one gets most of the quality." },
  { term: "data augmentation", gloss: "Manufacturing extra training examples by perturbing existing ones (crops, flips, paraphrases)." },
  { term: "regularization", gloss: "Any trick that deliberately constrains a model so it generalises instead of memorising." },
  { term: "dropout", gloss: "A regulariser that randomly switches off units during training so no single unit becomes load-bearing." },
  { term: "batch normalization", gloss: "Rescaling each layer's activations to a standard range mid-training, which stabilises and speeds up optimisation." },
  { term: "weight decay", gloss: "A penalty that keeps parameter values small, discouraging overconfident memorisation." },
  { term: "loss function", gloss: "The single number the whole training process is trying to make smaller — the model's definition of 'wrong'." },
  { term: "cross-entropy loss", gloss: "The standard loss for classification: it punishes confident wrong answers hardest." },
  { term: "objective function", gloss: "The quantity being optimised — a loss to minimise or a score to maximise." },
  { term: "hyperparameter", gloss: "A setting chosen by the experimenter before training (learning rate, layer count), as opposed to a parameter learned from data." },
  { term: "ablation study", gloss: "Systematically removing parts of a system to measure what each part actually contributes." },
  { term: "overfitting", gloss: "When a model nails its training data but fails on new data — memorising instead of learning the pattern." },
  { term: "underfitting", gloss: "When a model is too simple to capture even the training data's pattern." },
  { term: "epoch", gloss: "One full pass over the training dataset." },
  { term: "early stopping", gloss: "Halting training the moment performance on held-out data stops improving." },
  { term: "embedding", gloss: "Representing something (a word, a user, a molecule) as a vector of numbers so that similar things get similar coordinates." },
  { term: "representation learning", gloss: "Learning the embeddings themselves rather than hand-designing features." },
  { term: "zero-shot", gloss: "Evaluating a model on a task it was never explicitly trained on, with no examples given." },
  { term: "few-shot", gloss: "Adapting to a task from only a handful of examples." },
  { term: "in-context learning", gloss: "A large model adapting to a task purely from examples placed in its prompt — no weight updates at all." },
  { term: "instruction tuning", gloss: "Fine-tuning a model on examples of following instructions, so it behaves like an assistant." },
  { term: "reinforcement learning from human feedback", gloss: "Training a reward signal from human preference judgements, then optimising the model against it." },
  { term: "scaling law", gloss: "An empirical formula predicting how performance improves as models, data and compute grow." },
  { term: "emergent ability", gloss: "A capability that appears abruptly at some scale without being explicitly trained in." },

  // ── ML concepts ────────────────────────────────────────────────────────
  { term: "ground truth", gloss: "The reference answers considered correct, against which predictions are scored." },
  { term: "training set", gloss: "The portion of data the model learns from directly." },
  { term: "test set", gloss: "Held-out data the model never sees during training, used for the final honest score." },
  { term: "validation set", gloss: "Held-out data used during development to tune settings before the final test." },
  { term: "cross-validation", gloss: "Rotating which slice of the data is held out, so every example gets used for both training and validation." },
  { term: "benchmark", gloss: "A standardised public dataset plus scoring rules, so different methods can be compared fairly." },
  { term: "baseline", gloss: "The simple, established method that any new approach must beat to justify itself." },
  { term: "state of the art", gloss: "The best published result on a benchmark at the time of writing." },
  { term: "inference", gloss: "Running a trained model to make predictions, as opposed to training it." },
  { term: "generalization", gloss: "How well a model's learned behaviour carries over to data it never saw." },
  { term: "out-of-distribution", gloss: "Data that differs statistically from what the model was trained on — the usual place where models quietly fail." },
  { term: "hallucination", gloss: "A model generating fluent content that is simply not true or not grounded in its sources." },
  { term: "prompt engineering", gloss: "Crafting the input text to steer a model's output." },
  { term: "chain of thought", gloss: "Letting a model write out intermediate reasoning steps before the final answer." },
  { term: "retrieval-augmented generation", gloss: "Bolting a search step onto a generator so it answers from retrieved documents instead of memory alone." },
  { term: "parameter", gloss: "A learned number inside the model — '175B parameters' means 175 billion of these knobs." },
  { term: "feature", gloss: "One measurable input property the model builds its prediction from." },
  { term: "token", gloss: "The chunk of text (roughly a word or word-piece) that language models actually read and emit." },
  { term: "logits", gloss: "The model's raw, unnormalised scores for each possible output before they are turned into probabilities." },
  { term: "softmax", gloss: "The function that converts a list of scores into probabilities that sum to one." },
  { term: "confidence interval", gloss: "A range around an estimate that, by construction, would contain the true value in a stated share of repeated experiments." },
  { term: "ablation", gloss: "Removing a component to measure what it contributes (see ablation study)." },

  // ── Statistics · evaluation ────────────────────────────────────────────
  { term: "statistical significance", gloss: "A result extreme enough that it would be surprising to see by chance alone if there were truly no effect." },
  { term: "p-value", gloss: "The probability of seeing a result at least this extreme if the null hypothesis (no effect) were true." },
  { term: "null hypothesis", gloss: "The default 'nothing interesting is happening' claim that an experiment tries to rule out." },
  { term: "effect size", gloss: "How large the difference is, in real units — significant is not the same as important." },
  { term: "correlation coefficient", gloss: "A number between −1 and 1 summarising how linearly two variables move together." },
  { term: "regression", gloss: "Fitting a curve (usually a line) to predict a numeric value from inputs." },
  { term: "logistic regression", gloss: "Regression adapted to yes/no outcomes by squeezing the prediction into a probability." },
  { term: "bayesian", gloss: "An approach that treats beliefs as probability distributions and updates them with data." },
  { term: "prior distribution", gloss: "In Bayesian analysis, the belief about a quantity before seeing the current data." },
  { term: "posterior distribution", gloss: "In Bayesian analysis, the updated belief after combining the prior with the data." },
  { term: "markov chain", gloss: "A random process whose next state depends only on the current state, not the history." },
  { term: "monte carlo", gloss: "Solving hard problems by simulating random samples many times and averaging." },
  { term: "markov chain monte carlo", gloss: "A family of algorithms that sample from distributions too hard to compute directly, by wandering cleverly." },
  { term: "variance", gloss: "How spread out values are around their mean." },
  { term: "standard deviation", gloss: "The square root of variance — spread in the data's own units." },
  { term: "cohen's kappa", gloss: "An agreement measure that corrects for how much agreement you would get by chance alone." },
  { term: "roc curve", gloss: "A plot of true-positive rate against false-positive rate as the decision threshold slides." },
  { term: "area under the curve", gloss: "The single number summarising a ROC curve; 0.5 is coin-flip, 1.0 is perfect." },
  { term: "f1 score", gloss: "The harmonic mean of precision and recall — one number balancing the two." },
  { term: "precision", gloss: "Of the items the system flagged, the fraction that were genuinely correct." },
  { term: "recall", gloss: "Of all the items that were genuinely correct, the fraction the system managed to flag." },
  { term: "ablation analysis", gloss: "Removing components one at a time to measure each one's contribution." },
  { term: "sensitivity analysis", gloss: "Re-running the analysis under different assumptions to see which ones the conclusion actually depends on." },
  { term: "meta-analysis", gloss: "Statistically combining the results of many prior studies into one overall estimate." },
  { term: "systematic review", gloss: "A review with a pre-registered, reproducible protocol for finding and screening every relevant study." },
  { term: "randomized controlled trial", gloss: "An experiment where participants are randomly assigned to treatment or control, cancelling hidden biases." },
  { term: "cohort study", gloss: "Following a defined group over time and comparing outcomes across their exposures." },
  { term: "case-control study", gloss: "Comparing people who have an outcome against similar people who do not, looking backwards for the cause." },
  { term: "odds ratio", gloss: "How many times higher the odds of an outcome are in one group versus another." },
  { term: "hazard ratio", gloss: "The relative rate at which an event happens in one group versus another over time." },

  // ── Biomedicine · structural bio ───────────────────────────────────────
  { term: "protein structure prediction", gloss: "Computing a protein's 3D shape from its amino-acid sequence." },
  { term: "protein folding", gloss: "The physical process by which a chain of amino acids curls into its functional 3D shape." },
  { term: "amino acid", gloss: "One of the 20 building blocks that make up every protein." },
  { term: "alpha fold", gloss: "DeepMind's model family that largely solved protein structure prediction in 2020-21." },
  { term: "cryo-em", gloss: "Cryo-electron microscopy: freezing molecules and imaging them with electrons to recover 3D structure." },
  { term: "gene expression", gloss: "Which genes are actively being read out into RNA in a cell at a given moment." },
  { term: "genome-wide association study", gloss: "Scanning millions of genetic variants across thousands of people to find ones associated with a trait." },
  { term: "single-cell sequencing", gloss: "Reading the RNA of cells one cell at a time, revealing cell types that bulk averaging hides." },
  { term: "crispr", gloss: "A programmable molecular system for editing DNA at a chosen spot." },
  { term: "drug repurposing", gloss: "Finding new diseases an existing, already-safe drug could treat." },
  { term: "molecular docking", gloss: "Computationally testing how well a small molecule fits into a protein's binding pocket." },
  { term: "binding affinity", gloss: "How tightly a molecule sticks to its target — tighter usually means a better drug candidate." },
  { term: "in vitro", gloss: "Experiments done in glassware or cell culture, outside a living organism." },
  { term: "in vivo", gloss: "Experiments done in a living organism." },
  { term: "in silico", gloss: "Experiments done entirely on a computer." },

  // ── NLP · vision ───────────────────────────────────────────────────────
  { term: "natural language processing", gloss: "Getting computers to handle human language — parsing, translating, answering, summarising." },
  { term: "named entity recognition", gloss: "Tagging which spans of text are names, dates, genes, organisations, etc." },
  { term: "semantic segmentation", gloss: "Labelling every pixel in an image with the object class it belongs to." },
  { term: "object detection", gloss: "Drawing boxes around objects in an image and naming each one." },
  { term: "image classification", gloss: "Assigning a whole image one label from a fixed set of classes." },
  { term: "vision transformer", gloss: "A transformer applied to images by first cutting them into small patches treated as tokens." },
  { term: "optical character recognition", gloss: "Turning images of text into machine-readable text." },
  { term: "speech recognition", gloss: "Converting spoken audio into text." },
  { term: "machine translation", gloss: "Automatically translating text between languages." },
  { term: "question answering", gloss: "Systems that return an answer to a natural-language question, ideally with a source." },
  { term: "summarization", gloss: "Producing a shorter text that preserves the key content of the original." },
  { term: "paraphrase", gloss: "A restatement with the same meaning in different words." },

  // ── Research methods · meta ────────────────────────────────────────────
  { term: "replication crisis", gloss: "The finding across many fields that published results frequently fail to reproduce on re-running." },
  { term: "reproducibility", gloss: "Whether an independent team can re-run a study and get the same result from the published method." },
  { term: "open access", gloss: "Published papers that anyone can read without a subscription." },
  { term: "peer review", gloss: "Expert scrutiny of a paper before publication — imperfect, but the field's main quality gate." },
  { term: "preprint", gloss: "A paper posted publicly before formal peer review." },
  { term: "literature review", gloss: "A synthesis of what prior work has established on a question, organised by theme rather than listed." },
  { term: "annotation", gloss: "Human-added labels on data that models learn from or evaluators score against." },
  { term: "inter-rater reliability", gloss: "How consistently different human annotators or screeners agree with each other." },
  { term: "semantic scholar", gloss: "A free, machine-readable academic search engine and citation graph." },
  { term: "bibtex", gloss: "The plain-text citation format used by LaTeX and most reference managers." },
];

/** Lookup index built once: lowercase term → entry. */
const INDEX = new Map(JARGON_LEXICON.map((e) => [e.term.toLowerCase(), e]));

/** Terms sorted longest-first so "graph neural network" wins over "neural network". */
const SORTED_TERMS = [...JARGON_LEXICON].sort(
  (a, b) => b.term.length - a.term.length,
);

export function lookupTerm(term: string): LexiconEntry | undefined {
  return INDEX.get(term.toLowerCase());
}

export { SORTED_TERMS };
