import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { errorCode, errorMessage, ErrorService } from '@project-sunbird/sunbird-player-sdk-v9';
import * as _ from 'lodash-es';
import { CarouselComponent } from 'ngx-bootstrap/carousel';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { QumlPlayerConfig, IParentConfig } from '../quml-library-interface';
import { QuestionCursor } from '../quml-question-cursor.service';
import { ViewerService } from '../services/viewer-service/viewer-service';
import { eventName, pageId, TelemetryType } from '../telemetry-constants';
import { UtilService } from '../util-service';

@Component({
  selector: 'quml-section-player',
  templateUrl: './section-player.component.html',
  styleUrls: ['./section-player.component.scss', './../startpage/sb-ckeditor-styles.scss']
})
export class SectionPlayerComponent implements OnChanges {

  @Input() sectionConfig: QumlPlayerConfig;
  @Input() attempts: { max: number, current: number };
  @Input() isFirstSection = false;
  @Input() jumpToQuestion;
  @Input() mainProgressBar;
  @Input() sectionIndex = 0;
  @Input() parentConfig: IParentConfig;
  @Output() playerEvent = new EventEmitter<any>();
  @Output() telemetryEvent = new EventEmitter<any>();
  @Output() sectionEnd = new EventEmitter<any>();
  @Output() score = new EventEmitter<any>();
  @Output() summary = new EventEmitter<any>();
  @Output() showScoreBoard = new EventEmitter<any>();
  @Output() changeQuestion = new EventEmitter<any>();

  @ViewChild('myCarousel', { static: false }) myCarousel: CarouselComponent;
  @ViewChild('imageModal', { static: true }) imageModal;

  destroy$: Subject<boolean> = new Subject<boolean>();
  loadView = false;
  showContentError = false;
  noOfTimesApiCalled = 0;
  currentSlideIndex = 0;
  showStartPage = true;
  sideMenuConfig = {
    enable: true,
    showShare: true,
    showDownload: true,
    showReplay: false,
    showExit: true,
  };
  threshold: number;
  questions = [];
  questionIds: string[];
  questionIdsCopy: string[];
  noOfQuestions: number;
  initialTime: number;
  timeLimit: any;
  warningTime: number;
  showTimer: any;
  showFeedBack: boolean;
  showUserSolution: boolean;
  startPageInstruction: string;
  maxScore: number;
  points: number;
  initializeTimer: boolean;

  totalScore: number;
  linearNavigation: boolean;
  showHints: any;
  allowSkip: boolean;
  progressBarClass = [];
  currentQuestionsMedia: any;
  disableNext: boolean;
  endPageReached: boolean;
  tryAgainClicked = false;
  currentOptionSelected: string;
  carouselConfig = {
    NEXT: 1,
    PREV: 2
  };
  active = false;
  showAlert: boolean;
  currentOptions: any;
  currentQuestion: any;
  media: any;
  currentSolutions: any;
  showSolution: any;
  optionSelectedObj: any;
  intervalRef: any;
  alertType: string;
  infoPopup: boolean;
  outcomeLabel: string;
  stopAutoNavigation: boolean;
  jumpSlideIndex: any;
  showQuestions = false;
  showZoomModal = false;
  zoomImgSrc: string;
  imageZoomCount = 100;
  replayed = false;
  sectionId: string;
  showRootInstruction = true;

  constructor(
    public viewerService: ViewerService,
    public utilService: UtilService,
    public questionCursor: QuestionCursor,
    private cdRef: ChangeDetectorRef,
    public errorService: ErrorService
  ) { }

  ngOnChanges(changes): void {
    this.subscribeToEvents();
    this.setConfig();
  }

  ngAfterViewInit() {
    this.viewerService.raiseStartEvent(0);
    this.viewerService.raiseHeartBeatEvent(eventName.startPageLoaded, 'impression', 0);
  }

  private subscribeToEvents(): void {
    this.viewerService.qumlPlayerEvent.asObservable()
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.playerEvent.emit(res);
      });

    this.viewerService.qumlQuestionEvent
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {

        if (res?.error) {
          const { traceId } = this.sectionConfig?.config;
          if (navigator.onLine && this.viewerService.isAvailableLocally) {
            this.viewerService.raiseExceptionLog(errorCode.contentLoadFails, errorMessage.contentLoadFails,
              new Error(errorMessage.contentLoadFails), traceId);
          } else {
            this.viewerService.raiseExceptionLog(errorCode.internetConnectivity, errorMessage.internetConnectivity,
              new Error(errorMessage.internetConnectivity), traceId);
          }
          this.showContentError = true;
          return;
        }

        if (!res?.questions) {
          return;
        }
        const unCommonQuestions = _.xorBy(this.questions, res.questions, 'identifier');
        this.questions = _.uniqBy(this.questions.concat(unCommonQuestions), 'identifier');
        this.sortQuestions();
        this.viewerService.updateSectionQuestions(this.sectionConfig.metadata.identifier, this.questions);
        this.cdRef.detectChanges();
        this.noOfTimesApiCalled++;
        this.loadView = true;
        if (this.currentSlideIndex > 0 && this.myCarousel) {
          this.myCarousel.selectSlide(this.currentSlideIndex);
          if (this.questions[this.currentSlideIndex - 1]) {
            this.currentQuestionsMedia = this.questions[this.currentSlideIndex - 1]?.media;
            this.setImageZoom();
          }
		  this.changeQuestion.emit(this.questions[this.myCarousel.getCurrentSlideIndex() - 1]);
        }

        if (this.currentSlideIndex === 0) {
          if (this.showStartPage) {
            this.active = this.sectionIndex === 0;
          } else {
            setTimeout(() => { this.nextSlide(); });
          }
        }
      });
  }

  private setConfig() {
    this.noOfTimesApiCalled = 0;
    this.currentSlideIndex = 0;
    this.active = this.currentSlideIndex === 0 && this.sectionIndex === 0 && this.showStartPage;

    if (this.myCarousel) {
      this.myCarousel.selectSlide(this.currentSlideIndex);
    }
    this.sideMenuConfig = { ...this.sideMenuConfig, ...this.sectionConfig.config?.sideMenu };
    this.threshold = this.sectionConfig.context?.threshold || 3;
    this.questionIds = _.cloneDeep(this.sectionConfig.metadata.childNodes);

    if (this.parentConfig.isReplayed) {
      this.replayed = true;
      this.initializeTimer = true;
      this.viewerService.raiseStartEvent(0);
      this.viewerService.raiseHeartBeatEvent(eventName.startPageLoaded, 'impression', 0);
      this.disableNext = false;
      this.currentSlideIndex = 1;
      this.myCarousel.selectSlide(1);
      this.currentQuestionsMedia = _.get(this.questions[0], 'media');
      this.setImageZoom();
      this.loadView = true;
    }

    this.questionIdsCopy = _.cloneDeep(this.sectionConfig.metadata.childNodes);
    const maxQuestions = this.sectionConfig.metadata.maxQuestions;
    if (maxQuestions) {
      this.questionIds = this.questionIds.slice(0, maxQuestions);
      this.questionIdsCopy = this.questionIdsCopy.slice(0, maxQuestions);
    }

    this.noOfQuestions = this.questionIds.length;
    this.viewerService.initialize(this.sectionConfig, this.threshold, this.questionIds, this.parentConfig.isSectionsAvailable);
    this.checkCompatibilityLevel(this.sectionConfig.metadata.compatibilityLevel);
    this.initialTime = new Date().getTime();
    this.timeLimit = this.sectionConfig.metadata?.timeLimits?.maxTime || 0;
    this.warningTime = this.sectionConfig.metadata?.timeLimits?.warningTime || 0;
    this.showTimer = this.sectionConfig.metadata?.showTimer?.toLowerCase() !== 'no';
    this.showFeedBack = this.sectionConfig.metadata?.showFeedback?.toLowerCase() !== 'no';
    this.showUserSolution = this.sectionConfig.metadata?.showSolutions?.toLowerCase() !== 'no';
    this.startPageInstruction = this.sectionConfig.metadata?.instructions?.default || this.parentConfig.instructions;
    this.linearNavigation = this.sectionConfig.metadata.navigationMode === 'non-linear' ? false : true;
    this.showHints = this.sectionConfig.metadata?.showHints?.toLowerCase() !== 'no';
    this.points = this.sectionConfig.metadata?.points;

    this.allowSkip = this.sectionConfig.metadata?.allowSkip?.toLowerCase() !== 'no';
    this.showStartPage = this.sectionConfig.metadata?.showStartPage?.toLowerCase() !== 'no';
    this.totalScore = this.sectionConfig.metadata?.maxScore;
    this.progressBarClass = this.parentConfig.isSectionsAvailable ? this.mainProgressBar.find(item => item.isActive)?.children :
      this.mainProgressBar;

    this.questions = this.viewerService.getSectionQuestions(this.sectionConfig.metadata.identifier);
    this.sortQuestions();
    this.viewerService.updateSectionQuestions(this.sectionConfig.metadata.identifier, this.questions);
    this.resetQuestionState();
    if (this.jumpToQuestion) {
      this.goToQuestion(this.jumpToQuestion);
    } else if (this.threshold === 1) {
      this.viewerService.getQuestion();
    } else if (this.threshold > 1) {
      this.viewerService.getQuestions();
    }
	this.changeQuestion.emit(this.questions[this.myCarousel.getCurrentSlideIndex() - 1]);
  }

  sortQuestions() {
    if (this.questions.length && this.questionIds.length) {
      const ques = [];
      this.questionIds.forEach((questionId) => {
        const que = this.questions.find(question => question.identifier === questionId);
        if (que) {
          ques.push(que);
        }
      });
      this.questions = ques;
    }
  }

  createSummaryObj() {
    const classObj = _.groupBy(this.progressBarClass, 'class');
    return {
      skipped: classObj?.skipped?.length || 0,
      correct: classObj?.correct?.length || 0,
      wrong: classObj?.wrong?.length || 0,
      partial: classObj?.partial?.length || 0
    };
  }

  nextSlide() {
    this.currentQuestionsMedia = _.get(this.questions[this.currentSlideIndex], 'media');

    this.getQuestion();
    this.viewerService.raiseHeartBeatEvent(eventName.nextClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex() + 1);
    this.viewerService.raiseHeartBeatEvent(eventName.nextClicked, TelemetryType.impression, this.myCarousel.getCurrentSlideIndex() + 1);

    if (this.currentSlideIndex !== this.questions.length) {
      this.currentSlideIndex = this.currentSlideIndex + 1;
    }

    if (!this.initializeTimer) {
      this.initializeTimer = true;
    }

    if (this.myCarousel.getCurrentSlideIndex() === this.noOfQuestions) {
      this.emitSectionEnd();
      return;
    }

    if (this.myCarousel.isLast(this.myCarousel.getCurrentSlideIndex()) || this.noOfQuestions === this.myCarousel.getCurrentSlideIndex()) {
      this.calculateScore();
    }

    if (this.myCarousel.getCurrentSlideIndex() > 0 &&
      this.questions[this.myCarousel.getCurrentSlideIndex() - 1].qType === 'MCQ' && this.currentOptionSelected) {
      const option = this.currentOptionSelected && this.currentOptionSelected['option'] ? this.currentOptionSelected['option'] : undefined;
      const identifier = this.questions[this.myCarousel.getCurrentSlideIndex() - 1].identifier;
      const qType = this.questions[this.myCarousel.getCurrentSlideIndex() - 1].qType;
      this.viewerService.raiseResponseEvent(identifier, qType, option);
    }

    if (this.questions[this.myCarousel.getCurrentSlideIndex()]) {
      this.setSkippedClass(this.myCarousel.getCurrentSlideIndex());
    }
    this.myCarousel.move(this.carouselConfig.NEXT);
    this.setImageZoom();
    this.resetQuestionState();
    this.clearTimeInterval();
	this.changeQuestion.emit(this.questions[this.myCarousel.getCurrentSlideIndex() - 1]);
  }

  prevSlide() {
    this.disableNext = false;
    this.currentSolutions = undefined;
    this.viewerService.raiseHeartBeatEvent(eventName.prevClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex() - 1);
    this.showAlert = false;

    if (this.currentSlideIndex !== this.questions.length) {
      this.currentSlideIndex = this.currentSlideIndex + 1;
    }

    if (this.myCarousel.getCurrentSlideIndex() + 1 === this.noOfQuestions && this.endPageReached) {
      this.endPageReached = false;
    } else {
      this.myCarousel.move(this.carouselConfig.PREV);
    }
    this.currentSlideIndex = this.myCarousel.getCurrentSlideIndex();
    this.active = this.currentSlideIndex === 0 && this.sectionIndex === 0 && this.showStartPage;
    this.currentQuestionsMedia = _.get(this.questions[this.myCarousel.getCurrentSlideIndex() - 1], 'media');
	  this.changeQuestion.emit(this.questions[this.myCarousel.getCurrentSlideIndex() - 1]);
    this.setImageZoom();
    this.setSkippedClass(this.myCarousel.getCurrentSlideIndex() - 1);
  }

  getQuestion() {
    if (this.myCarousel.getCurrentSlideIndex() > 0
      && ((this.threshold * this.noOfTimesApiCalled) - 1) === this.myCarousel.getCurrentSlideIndex()
      && this.threshold * this.noOfTimesApiCalled >= this.questions.length && this.threshold > 1) {
      this.viewerService.getQuestions();
    }

    if (this.myCarousel.getCurrentSlideIndex() > 0
      && this.questions[this.myCarousel.getCurrentSlideIndex()] === undefined && this.threshold > 1) {
      this.viewerService.getQuestions();
    }

    if (this.threshold === 1 && this.myCarousel.getCurrentSlideIndex() >= 0) {
      this.viewerService.getQuestion();
    }
  }

  resetQuestionState() {
    this.active = false;
    this.showAlert = false;
    this.optionSelectedObj = undefined;
    this.currentOptionSelected = undefined;
    this.currentQuestion = undefined;
    this.currentOptions = undefined;
    this.currentSolutions = undefined;
  }

  nextSlideClicked(event) {
    if (this.showRootInstruction) {
      this.showRootInstruction = false;
      return;
    }
    if (this.myCarousel.getCurrentSlideIndex() === 0) {
      return this.nextSlide();
    }
    if (event?.type === 'next') {
      this.validateSelectedOption(this.optionSelectedObj, 'next');
    }
  }

  previousSlideClicked(event) {
    if (event.event === 'previous clicked') {
      if (this.optionSelectedObj && this.showFeedBack) {
        this.stopAutoNavigation = false;
        this.validateSelectedOption(this.optionSelectedObj, 'previous');
      } else {
        this.stopAutoNavigation = true;
        if (this.currentSlideIndex === 0 && this.parentConfig.isSectionsAvailable && this.getCurrentSectionIndex() > 0) {
          const previousSectionId = this.mainProgressBar[this.getCurrentSectionIndex() - 1].identifier;
          this.jumpToSection(previousSectionId);
          return;
        }
        this.prevSlide();
      }
    }
  }

  getCurrentSectionIndex(): number {
    const currentSectionId = this.sectionConfig.metadata.identifier;
    return this.mainProgressBar.findIndex(section => section.identifier === currentSectionId);
  }

  goToSlideClicked(event, index) {
    event.stopPropagation();
    this.active = false;
    this.jumpSlideIndex = index;
    if (this.optionSelectedObj && this.showFeedBack) {
      this.stopAutoNavigation = false;
      this.validateSelectedOption(this.optionSelectedObj, 'jump');
    } else {
      this.stopAutoNavigation = true;
      this.goToSlide(this.jumpSlideIndex);
    }
  }

  jumpToSection(identifier: string) {
    this.showRootInstruction = false;
    this.emitSectionEnd(false, identifier);
  }

  onScoreBoardClicked() {
    this.viewerService.updateSectionQuestions(this.sectionConfig.metadata.identifier, this.questions);
    this.showScoreBoard.emit();
  }


  getOptionSelected(optionSelected) {
    this.active = true;
    this.currentOptionSelected = optionSelected;
    const currentIndex = this.myCarousel.getCurrentSlideIndex() - 1;
    this.viewerService.raiseHeartBeatEvent(eventName.optionClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());

    // This optionSelected comes empty whenever the try again is clicked on feedback popup
    if (_.isEmpty(optionSelected?.option)) {
      this.optionSelectedObj = undefined;
      this.currentSolutions = undefined;
      this.updateScoreBoard(currentIndex, 'skipped');
    } else {
      this.optionSelectedObj = optionSelected;
      this.currentSolutions = !_.isEmpty(optionSelected.solutions) ? optionSelected.solutions : undefined;
    }
    this.media = this.questions[this.myCarousel.getCurrentSlideIndex() - 1].media;

    if (this.currentSolutions) {
      this.currentSolutions.forEach((ele, index) => {
        if (ele.type === 'video') {
          this.media.forEach((e) => {
            if (e.id === this.currentSolutions[index].value) {
              this.currentSolutions[index].type = 'video';
              this.currentSolutions[index].src = e.src;
              this.currentSolutions[index].thumbnail = e.thumbnail;
            }
          });
        }
      });
    }
    if (!this.showFeedBack) {
      this.validateSelectedOption(this.optionSelectedObj);
    }
  }

  durationEnds() {
    this.showSolution = false;
    this.showAlert = false;
    this.emitSectionEnd(true);
  }

  private checkCompatibilityLevel(compatibilityLevel) {
    if (compatibilityLevel) {
      const checkContentCompatible = this.errorService.checkContentCompatibility(compatibilityLevel);

      if (!checkContentCompatible.isCompitable) {
        this.viewerService.raiseExceptionLog(errorCode.contentCompatibility, errorMessage.contentCompatibility,
          checkContentCompatible.error, this.sectionConfig?.config?.traceId);
      }
    }
  }

  emitSectionEnd(isDurationEnded: boolean = false, jumpToSection?: string) {
    const eventObj: any = {
      summary: this.createSummaryObj(),
      score: this.calculateScore(),
      durationSpent: this.utilService.getTimeSpentText(this.initialTime),
      slideIndex: this.myCarousel.getCurrentSlideIndex(),
      isDurationEnded,
    };
    if (jumpToSection) {
      eventObj.jumpToSection = jumpToSection;
    }
    this.viewerService.updateSectionQuestions(this.sectionConfig.metadata.identifier, this.questions);
    this.sectionEnd.emit(eventObj);
  }

  closeAlertBox(event) {
    if (event?.type === 'close') {
      this.viewerService.raiseHeartBeatEvent(eventName.closedFeedBack, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    } else if (event?.type === 'tryAgain') {
      this.tryAgainClicked = true;
      setTimeout(() => {
        this.tryAgainClicked = false;
      }, 2000);
      this.viewerService.raiseHeartBeatEvent(eventName.tryAgain, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    }
    this.showAlert = false;
  }

  setSkippedClass(index) {
    if (_.get(this.progressBarClass[index], 'class') === 'unattempted') {
      this.progressBarClass[index].class = 'skipped';
    }
  }

  sideBarEvents(event) {
    this.viewerService.raiseHeartBeatEvent(event, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex() + 1);
  }

  validateSelectedOption(option, type?: string) {
    const selectedOptionValue = option?.option?.value;
    const currentIndex = this.myCarousel.getCurrentSlideIndex() - 1;
    const isQuestionSkipAllowed = !this.optionSelectedObj &&
      this.allowSkip && this.utilService.getQuestionType(this.questions, currentIndex) === 'MCQ';
    const isSubjectiveQuestion = this.utilService.getQuestionType(this.questions, currentIndex) === 'SA';
    const onStartPage = this.startPageInstruction && this.myCarousel.getCurrentSlideIndex() === 0;
    const isActive = !this.optionSelectedObj && this.active;

    if (this.optionSelectedObj) {
      const key = this.utilService.getKeyValue(Object.keys(this.questions[currentIndex].responseDeclaration));
      this.currentQuestion = this.questions[currentIndex].body;
      this.currentOptions = this.questions[currentIndex].interactions[key].options;

      if (option.cardinality === 'single') {
        const correctOptionValue = Number(this.questions[currentIndex].responseDeclaration[key].correctResponse.value);
        const edataItem: any = {
          'id': this.questions[currentIndex].identifier,
          'title': this.questions[currentIndex].name,
          'desc': this.questions[currentIndex].description,
          'maxscore': this.questions[currentIndex].responseDeclaration[key].maxScore || 0,
          'params': []
        };

        if (edataItem && this.parentConfig.isSectionsAvailable) {
          edataItem.sectionId = this.sectionConfig.metadata.identifier;
        }

        this.showAlert = true;
        if (option.option?.value === correctOptionValue) {
          const currentScore = this.getScore(currentIndex, key, true);
          this.viewerService.raiseAssesEvent(edataItem, currentIndex, 'Yes', currentScore, [option.option], new Date().getTime());
          this.alertType = 'correct';
          this.correctFeedBackTimeOut(type);
          this.updateScoreBoard(currentIndex, 'correct', undefined, currentScore);
        } else {
          const currentScore = this.getScore(currentIndex, key, false, option);
          this.alertType = 'wrong';
          const classType = this.progressBarClass[currentIndex].class === 'partial' ? 'partial' : 'wrong';
          this.updateScoreBoard(currentIndex, classType, selectedOptionValue, currentScore);
        }
      }
      if (option.cardinality === 'multiple') {
        const responseDeclaration = this.questions[currentIndex].responseDeclaration;
        const currentScore = this.utilService.getMultiselectScore(option.option, responseDeclaration);
        if (this.showFeedBack) {
          this.showAlert = true;
          if (currentScore === 0) {
            this.alertType = 'wrong';
            this.updateScoreBoard((currentIndex + 1), 'wrong');
          } else {
            this.updateScoreBoard(((currentIndex + 1)), 'correct', undefined, currentScore);
            this.correctFeedBackTimeOut(type);
            this.alertType = 'correct';
          }
        } else {
          this.nextSlide();
        }
      }
      this.optionSelectedObj = undefined;
    } else if ((isQuestionSkipAllowed) || isSubjectiveQuestion || onStartPage || isActive) {
      this.nextSlide();
    } else if (this.startPageInstruction && !this.optionSelectedObj && !this.active && !this.allowSkip &&
      this.myCarousel.getCurrentSlideIndex() > 0 && this.utilService.getQuestionType(this.questions, currentIndex) === 'MCQ'
      && this.utilService.canGo(this.progressBarClass[this.myCarousel.getCurrentSlideIndex()])) {
      this.infoPopupTimeOut();
    } else if (!this.optionSelectedObj && !this.active && !this.allowSkip && this.myCarousel.getCurrentSlideIndex() >= 0
      && this.utilService.getQuestionType(this.questions, currentIndex) === 'MCQ'
      && this.utilService.canGo(this.progressBarClass[this.myCarousel.getCurrentSlideIndex()])) {
      this.infoPopupTimeOut();
    }
  }

  infoPopupTimeOut() {
    this.infoPopup = true;
    setTimeout(() => {
      this.infoPopup = false;
    }, 2000);
  }

  correctFeedBackTimeOut(type?: string) {
    this.intervalRef = setTimeout(() => {
      this.showAlert = false;
      if (!this.myCarousel.isLast(this.myCarousel.getCurrentSlideIndex()) && type === 'next') {
        this.nextSlide();
      } else if (type === 'previous' && !this.stopAutoNavigation) {
        this.prevSlide();
      } else if (type === 'jump' && !this.stopAutoNavigation) {
        this.goToSlide(this.jumpSlideIndex);
      } else if (this.myCarousel.isLast(this.myCarousel.getCurrentSlideIndex())) {
        this.endPageReached = true;
        this.emitSectionEnd();
      }
    }, 4000);
  }

  goToSlide(index) {
    this.viewerService.raiseHeartBeatEvent(eventName.goToQuestion, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    this.disableNext = false;
    this.currentSlideIndex = index;
    if (index === 0) {
      this.optionSelectedObj = undefined;
      this.myCarousel.selectSlide(0);
      this.active = this.currentSlideIndex === 0 && this.sectionIndex === 0 && this.showStartPage;
      this.showRootInstruction = true;
      return;
    }
    this.currentQuestionsMedia = _.get(this.questions[this.currentSlideIndex - 1], 'media');
    this.setSkippedClass(this.currentSlideIndex - 1);
    if (!this.initializeTimer) {
      this.initializeTimer = true;
    }
    if (this.questions[index - 1] === undefined) {
      this.showQuestions = false;
      this.viewerService.getQuestions(0, index);
      this.currentSlideIndex = index;
    } else if (this.questions[index - 1] !== undefined) {
      this.myCarousel.selectSlide(index);
    }
    this.setImageZoom();
	this.changeQuestion.emit(this.questions[this.myCarousel.getCurrentSlideIndex() - 1]);
    this.currentSolutions = undefined;
  }

  goToQuestion(event) {
    this.active = false;
    this.disableNext = false;
    this.initializeTimer = true;
    const index = event.questionNo;
    this.viewerService.getQuestions(0, index);
    this.currentSlideIndex = index;
    this.myCarousel.selectSlide(index);
	this.changeQuestion.emit(this.questions[this.myCarousel.getCurrentSlideIndex() - 1]);
  }

  getSolutions() {
    this.showAlert = false;
    this.viewerService.raiseHeartBeatEvent(eventName.showAnswer, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    this.viewerService.raiseHeartBeatEvent(eventName.showAnswer, TelemetryType.impression, this.myCarousel.getCurrentSlideIndex());
    const currentIndex = this.myCarousel.getCurrentSlideIndex() - 1;
    this.currentQuestion = this.questions[currentIndex].body;
    this.currentOptions = this.questions[currentIndex].interactions.response1.options;
    this.currentQuestionsMedia = _.get(this.questions[currentIndex], 'media');
    setTimeout(() => {
      this.setImageZoom();
    });
    setTimeout(() => {
      this.setImageHeightWidthClass();
    }, 100);
    if (this.currentSolutions) {
      this.showSolution = true;
    }
    this.clearTimeInterval();
  }

  viewSolution() {
    this.viewerService.raiseHeartBeatEvent(eventName.viewSolutionClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    this.showSolution = true;
    this.showAlert = false;
    this.currentQuestionsMedia = _.get(this.questions[this.myCarousel.getCurrentSlideIndex() - 1], 'media');
    this.setImageZoom();
    setTimeout(() => {
      this.setImageHeightWidthClass();
    });
    clearTimeout(this.intervalRef);
  }

  closeSolution() {
    this.setImageZoom();
    this.viewerService.raiseHeartBeatEvent(eventName.solutionClosed, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    this.showSolution = false;
    this.myCarousel.selectSlide(this.currentSlideIndex);
	this.changeQuestion.emit(this.questions[this.myCarousel.getCurrentSlideIndex() - 1]);
  }

  viewHint() {
    this.viewerService.raiseHeartBeatEvent(eventName.viewHint, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
  }

  showAnswerClicked(event, question?) {
    if (event?.showAnswer) {
      this.active = true;
      this.progressBarClass[this.myCarousel.getCurrentSlideIndex() - 1].class = 'correct';
      if (question) {
        const index = this.questions.findIndex(que => que.identifier === question.identifier);
        if (index > -1) {
          this.questions[index].isAnswerShown = true;
          this.viewerService.updateSectionQuestions(this.sectionConfig.metadata.identifier, this.questions);
        }
      }
      this.viewerService.raiseHeartBeatEvent(eventName.showAnswer, TelemetryType.interact, pageId.shortAnswer);
      this.viewerService.raiseHeartBeatEvent(eventName.pageScrolled, TelemetryType.impression, this.myCarousel.getCurrentSlideIndex() - 1);
    }
  }

  getScore(currentIndex, key, isCorrectAnswer, selectedOption?) {
    if (isCorrectAnswer) {
      return this.questions[currentIndex].responseDeclaration[key].correctResponse.outcomes.SCORE ?
        this.questions[currentIndex].responseDeclaration[key].correctResponse.outcomes.SCORE :
        this.questions[currentIndex].responseDeclaration[key].maxScore || 1;
    } else {
      const selectedOptionValue = selectedOption.option.value;
      const mapping = this.questions[currentIndex].responseDeclaration.mapping;
      let score = 0;

      if (mapping) {
        mapping.forEach((val) => {
          if (selectedOptionValue === val.response) {
            score = val.outcomes.SCORE || 0;
            if (val.outcomes.SCORE) {
              this.progressBarClass[currentIndex].class = 'partial';
            }
          }
        });
      }
      return score;
    }
  }

  calculateScore() {
    return this.progressBarClass.reduce((accumulator, element) => accumulator + element.score, 0);
  }

  updateScoreBoard(index, classToBeUpdated, optionValue?, score?) {
    this.progressBarClass.forEach((ele) => {
      if (ele.index - 1 === index) {
        ele.class = classToBeUpdated;
        ele.score = score ? score : 0;

        if (!this.showFeedBack) {
          ele.value = optionValue;
        }
      }
    });
  }

  /* End of score methods  */

  /* Start of Image zoom related */
  setImageHeightWidthClass() {
    document.querySelectorAll('[data-asset-variable]').forEach(image => {
      image.removeAttribute('class');
      if (image.clientHeight > image.clientWidth) {
        image.setAttribute('class', 'portrait');
      } else if (image.clientHeight < image.clientWidth) {
        image.setAttribute('class', 'landscape');
      } else {
        image.setAttribute('class', 'neutral');
      }
    });
  }

  setImageZoom() {
    const index = this.myCarousel.getCurrentSlideIndex() - 1;
    const currentQuestionId = this.questions[index]?.identifier;
    document.querySelectorAll('[data-asset-variable]').forEach(image => {
      const imageId = image.getAttribute('data-asset-variable');
      image.setAttribute('class', 'option-image');
      image.setAttribute('id', imageId);
      _.forEach(this.currentQuestionsMedia, (val) => {
        if (imageId === val.id) {
          if (this.sectionConfig.metadata.isAvailableLocally && this.parentConfig.baseUrl) {
            if (currentQuestionId) {
              image['src'] = `${this.parentConfig.baseUrl}/${currentQuestionId}/${val.src}`;
            }
          } else if (val.baseUrl) {
            image['src'] = val.baseUrl + val.src;
          }
        }
      });
      const divElement = document.createElement('div');
      divElement.setAttribute('class', 'magnify-icon');
      divElement.onclick = (event) => {
        this.viewerService.raiseHeartBeatEvent(eventName.zoomClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
        this.zoomImgSrc = image['src'];
        this.showZoomModal = true;
        const zoomImage = document.getElementById('imageModal');
        if (zoomImage.clientHeight > image.clientWidth) {
          zoomImage.setAttribute('class', 'portrait');
        } else if (image.clientHeight < image.clientWidth) {
          zoomImage.setAttribute('class', 'landscape');
        } else {
          zoomImage.setAttribute('class', 'neutral');
        }
        event.stopPropagation();
      };
      image.parentNode.insertBefore(divElement, image.nextSibling);
    });
  }

  // Method Name changed
  zoomIn() {
    this.viewerService.raiseHeartBeatEvent(eventName.zoomInClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    this.imageZoomCount = this.imageZoomCount + 10;
    this.setImageModalHeightWidth();
  }

  // Method Name changed
  zoomOut() {
    this.viewerService.raiseHeartBeatEvent(eventName.zoomOutClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    if (this.imageZoomCount > 100) {
      this.imageZoomCount = this.imageZoomCount - 10;
      this.setImageModalHeightWidth();
    }
  }

  setImageModalHeightWidth() {
    this.imageModal.nativeElement.style.width = `${this.imageZoomCount}%`;
    this.imageModal.nativeElement.style.height = `${this.imageZoomCount}%`;
  }

  closeZoom() {
    this.viewerService.raiseHeartBeatEvent(eventName.zoomCloseClicked, TelemetryType.interact, this.myCarousel.getCurrentSlideIndex());
    document.getElementById('imageModal').removeAttribute('style');
    this.showZoomModal = false;
  }
  /* End of Image zoom related */

  clearTimeInterval() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }
  }

  @HostListener('window:beforeunload')
  ngOnDestroy() {
    this.destroy$.next(true);
    this.destroy$.unsubscribe();
    this.errorService.getInternetConnectivityError.unsubscribe();
  }
}
