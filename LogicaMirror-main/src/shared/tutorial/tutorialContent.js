export function getTutorialContent(language) {
  return tutorialContent[language] || tutorialContent.en;
}

const tutorialContent = {
  en: {
    title: "How LogicaMirror Works",
    subtitle: "A reading system for predicting before the source gives the answer.",
    thesisTitle: "Core idea",
    thesis:
      "LogicaMirror slows reading down at meaningful moments. It hides only the checkpoint passage, asks you to predict the concept, then verifies your reasoning against the source.",
    stepsTitle: "Learning loop",
    steps: [
      {
        name: "Read",
        detail: "Read the visible source normally until the active checkpoint line appears."
      },
      {
        name: "Predict",
        detail: "Write what relation, condition, cause, rule, method, or consequence you expect."
      },
      {
        name: "Verify",
        detail: "Use API verification to compare your reasoning with only the hidden checkpoint passage."
      },
      {
        name: "Review",
        detail: "Reveal the source after you have tried. Compare your prediction with the original text."
      },
      {
        name: "Reflect",
        detail: "Keep the smallest correction, connection, doubt, or memory note."
      }
    ],
    rulesTitle: "What matters",
    rules: [
      "The source stays primary.",
      "AI mirrors your reasoning; it does not replace it.",
      "Checkpoints should be sparse and conceptually meaningful.",
      "Normal text remains readable. Only the current checkpoint passage is gated.",
      "Verification needs a working API connection; missing connections show an error."
    ],
    checkpointTitle: "Good checkpoints",
    checkpointText:
      "Good checkpoints are moments where understanding depends on predicting an abstract move: a definition, theorem step, cause/effect relation, interpretive claim, method, invariant, rule, or consequence.",
    closeLabel: "Start reading"
  },
  de: {
    title: "So funktioniert LogicaMirror",
    subtitle: "Ein Lesesystem, bei dem du vor der Quelle selbst vorhersagst.",
    thesisTitle: "Grundidee",
    thesis:
      "LogicaMirror verlangsamt das Lesen an wichtigen Stellen. Es verdeckt nur die Checkpoint-Passage, laesst dich das Konzept vorhersagen und prueft dann deine Logik gegen die Quelle.",
    stepsTitle: "Lernschleife",
    steps: [
      {
        name: "Lesen",
        detail: "Lies die sichtbare Quelle normal weiter, bis die aktive Checkpoint-Linie erscheint."
      },
      {
        name: "Vorhersagen",
        detail: "Schreibe, welche Relation, Bedingung, Ursache, Regel, Methode oder Folge du erwartest."
      },
      {
        name: "Pruefen",
        detail: "Nutze die API-Verifikation, um deine Logik nur mit der verdeckten Checkpoint-Passage zu vergleichen."
      },
      {
        name: "Review",
        detail: "Zeige die Quelle erst nach deinem Versuch. Vergleiche deine Vorhersage mit dem Originaltext."
      },
      {
        name: "Reflektieren",
        detail: "Halte die kleinste Korrektur, Verbindung, Zweifelstelle oder Memory-Notiz fest."
      }
    ],
    rulesTitle: "Worauf es ankommt",
    rules: [
      "Die Quelle bleibt die Wahrheit.",
      "AI spiegelt deine Logik; sie ersetzt dein Denken nicht.",
      "Checkpoints sollen selten und konzeptuell wichtig sein.",
      "Normaler Text bleibt lesbar. Nur die aktuelle Checkpoint-Passage wird verdeckt.",
      "Verifikation braucht eine funktionierende API-Verbindung; fehlende Verbindung zeigt einen Fehler."
    ],
    checkpointTitle: "Gute Checkpoints",
    checkpointText:
      "Gute Checkpoints sind Stellen, an denen Verstehen davon abhaengt, einen abstrakten Schritt vorherzusagen: Definition, Beweisschritt, Ursache-Wirkung, Deutung, Methode, Invariante, Regel oder Konsequenz.",
    closeLabel: "Zum Lesen"
  },
  es: {
    title: "Como funciona LogicaMirror",
    subtitle: "Un sistema de lectura donde predices antes de ver la respuesta de la fuente.",
    thesisTitle: "Idea central",
    thesis:
      "LogicaMirror desacelera la lectura en momentos importantes. Oculta solo el pasaje del checkpoint, te pide predecir el concepto y despues verifica tu logica contra la fuente.",
    stepsTitle: "Ciclo de aprendizaje",
    steps: [
      {
        name: "Leer",
        detail: "Lee la fuente visible con normalidad hasta que aparezca la linea activa del checkpoint."
      },
      {
        name: "Predecir",
        detail: "Escribe que relacion, condicion, causa, regla, metodo o consecuencia esperas."
      },
      {
        name: "Verificar",
        detail: "Usa la verificacion API para comparar tu razonamiento solo con el pasaje oculto."
      },
      {
        name: "Revisar",
        detail: "Revela la fuente despues de intentarlo. Compara tu prediccion con el texto original."
      },
      {
        name: "Reflexionar",
        detail: "Guarda la correccion minima, conexion, duda o nota de memoria."
      }
    ],
    rulesTitle: "Lo importante",
    rules: [
      "La fuente sigue siendo la verdad.",
      "La IA refleja tu logica; no reemplaza tu pensamiento.",
      "Los checkpoints deben ser escasos y conceptualmente importantes.",
      "El texto normal sigue visible. Solo se oculta el pasaje activo del checkpoint.",
      "La verificacion requiere una conexion API activa; si falta, se muestra un error."
    ],
    checkpointTitle: "Buenos checkpoints",
    checkpointText:
      "Un buen checkpoint es un momento donde entender depende de predecir un movimiento abstracto: definicion, paso de prueba, causa/efecto, interpretacion, metodo, invariante, regla o consecuencia.",
    closeLabel: "Empezar a leer"
  }
};
