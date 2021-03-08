import { Component, OnInit, Input, ViewChild, Output, EventEmitter, AfterViewInit, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { CarouselComponent } from 'ngx-bootstrap/carousel';
import { QumlLibraryService } from '../quml-library.service';
import { QumlPlayerConfig } from '../quml-library-interface';
import { UserService } from '../user-service';
import { eventName, TelemetryType, pageId } from '../telemetry-constants';
import { UtilService } from '../util-service';



@Component({
  selector: 'quml-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.scss']
})
export class PlayerComponent implements OnInit, AfterViewInit {
  @Input() QumlPlayerConfig: QumlPlayerConfig;
  @Output() playerEvent = new EventEmitter<any>();
  @Output() telemetryEvent = new EventEmitter<any>();
  @ViewChild('car') car: CarouselComponent;


  questions: any;
  linearNavigation: boolean;
  endPageReached: boolean;
  slideInterval: number;
  showIndicator: Boolean;
  noWrapSlides: Boolean;
  optionSelectedObj: any;
  showAlert: Boolean;
  currentOptions: any;
  currentQuestion: any;
  media: any;
  currentSolutions: any;
  showSolution: any;
  active = false;
  alertType: boolean;
  previousOption: any;
  timeLimit: any;
  showTimer: any;
  showFeedBack: boolean;
  showUserSolution: boolean;
  startPageInstruction: string;
  shuffleQuestions: boolean;
  requiresSubmit: boolean;
  noOfQuestions: number;
  maxScore: number;
  initialTime: number;
  initializeTimer: boolean;
  durationSpent: string;
  userName: string;
  contentName: string;
  currentSlideIndex = 0;
  attemptedQuestions = [];
  loadScoreBoard = false;
  totalScore = [];
  private intervalRef: any;
  public finalScore = 0;
  progressBarClass = [];
  currentScore
  CarouselConfig = {
    NEXT: 1,
    PREV: 2
  };
  sideMenuConfig = {
    showShare: true,
    showDownload: true,
    showReplay: false,
    showExit: true,
  };
  warningTime: number;

  constructor(
    public qumlLibraryService: QumlLibraryService,
    public userService: UserService,
    public utilService : UtilService
  ) {
    this.endPageReached = false;
    this.userService.qumlPlayerEvent.asObservable().subscribe((res) => {
      this.playerEvent.emit(res);
    });
  }

  @HostListener('document:TelemetryEvent', ['$event'])
  onTelemetryEvent(event) {
    this.telemetryEvent.emit(event.detail);
  }

  ngOnInit() {
    this.qumlLibraryService.initializeTelemetry(this.QumlPlayerConfig);
    this.userService.initialize(this.QumlPlayerConfig);
    this.initialTime = new Date().getTime();
    this.slideInterval = 0;
    this.showIndicator = false;
    this.noWrapSlides = true;
    this.questions = this.QumlPlayerConfig.data.children;
    this.timeLimit = this.QumlPlayerConfig.data.timeLimits.totalTime ?
      this.QumlPlayerConfig.data.timeLimits.totalTime : (this.questions.length * 350000);
    this.warningTime = this.QumlPlayerConfig.data.timeLimits.warningTime;
    this.showTimer = this.QumlPlayerConfig.data.showTimer;
    this.showFeedBack = this.QumlPlayerConfig.data.showFeedback;
    this.showUserSolution = this.QumlPlayerConfig.data.showSolutions;
    this.startPageInstruction = this.QumlPlayerConfig.metadata.instructions;
    this.linearNavigation = this.QumlPlayerConfig.data.navigationMode === 'non-linear' ? false : true;
    this.requiresSubmit = this.QumlPlayerConfig.data.requiresSubmit;
    this.noOfQuestions = this.QumlPlayerConfig.data.totalQuestions;
    this.maxScore = this.QumlPlayerConfig.data.maxScore;
    this.userName = this.QumlPlayerConfig.context.userData.firstName + ' ' + this.QumlPlayerConfig.context.userData.lastName;
    this.contentName = this.QumlPlayerConfig.data.name;
    this.shuffleQuestions = this.QumlPlayerConfig.data.shuffle;
    if (this.shuffleQuestions) {
      this.questions = this.QumlPlayerConfig.data.children.sort(() => Math.random() - 0.5);
    }
    this.userService.raiseStartEvent(this.car.getCurrentSlideIndex());
    this.setInitialScores();
  }

  ngAfterViewInit() {
    this.userService.raiseHeartBeatEvent(eventName.startPageLoaded, TelemetryType.impression, pageId.startPage);
  }

  nextSlide() {
    this.userService.raiseHeartBeatEvent(eventName.nextClicked, TelemetryType.interact, this.currentSlideIndex);
    if (this.loadScoreBoard) {
      this.calculateScore();
      this.endPageReached = true;
    }
    if (this.currentSlideIndex !== this.questions.length) {
      this.currentSlideIndex = this.currentSlideIndex + 1;
    }
    if (this.currentSlideIndex === 1 && (this.currentSlideIndex - 1) === 0) {
      this.initializeTimer = true;
    }
    if (this.car.getCurrentSlideIndex() === this.questions.length) {
      const spentTime = (new Date().getTime() - this.initialTime) / 10000;
      this.durationSpent = spentTime.toFixed(2);
      if (!this.requiresSubmit) {
        this.calculateScore();
        this.endPageReached = true;
        this.userService.raiseEndEvent(this.currentSlideIndex, this.attemptedQuestions.length, this.endPageReached);
      } else {
        this.loadScoreBoard = true;
      }
    }
    this.car.move(this.CarouselConfig.NEXT);
    this.active = false;
    this.showAlert = false;
    this.optionSelectedObj = undefined;
    this.currentQuestion = undefined;
    this.currentOptions = undefined;
    this.currentSolutions = undefined;
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
    }
  }

  prevSlide() {
    this.userService.raiseHeartBeatEvent(eventName.prevClicked, TelemetryType.interact, this.car.getCurrentSlideIndex());
    this.showAlert = false;
    if (this.currentSlideIndex > 0) {
      this.currentSlideIndex = this.currentSlideIndex - 1;
    }
    if (this.car.getCurrentSlideIndex() + 1 === this.questions.length && this.endPageReached) {
      this.endPageReached = false;
    } else if (!this.loadScoreBoard) {
      this.car.move(this.CarouselConfig.PREV);
    } else if (!this.linearNavigation && this.loadScoreBoard) {
      const index = this.questions.length;
      this.car.selectSlide(index);
      this.loadScoreBoard = false;
    }
  }

  sideBarEvents(event) {
    this.userService.raiseHeartBeatEvent(event, TelemetryType.interact, this.car.getCurrentSlideIndex());
  }


  getOptionSelected(optionSelected) {
    this.active = true;
    const currentIndex = this.car.getCurrentSlideIndex() - 1;
    this.userService.raiseHeartBeatEvent(eventName.optionClicked, TelemetryType.interact, pageId.startPage);
    this.optionSelectedObj = optionSelected;
    this.currentSolutions = optionSelected.solutions;
    this.media = this.questions[currentIndex].media;
    if (this.currentSolutions) {
      this.currentSolutions.forEach((ele, index) => {
        if (ele.type === 'video') {
          this.media.forEach((e) => {
            if (e.id === this.currentSolutions[index].value) {
              this.currentSolutions[index].type = 'video'
              this.currentSolutions[index].src = e.src;
              this.currentSolutions[index].thumbnail = e.thumbnail;
            }
          })
        }
      })
    }
  }

  closeAlertBox(event) {
    if (event.type === 'close') {
      this.userService.raiseHeartBeatEvent(eventName.closedFeedBack, TelemetryType.interact, this.car.getCurrentSlideIndex());
    } else if (event.type === 'tryAgain') {
      this.userService.raiseHeartBeatEvent(eventName.tryAgain, TelemetryType.interact, this.car.getCurrentSlideIndex());
    }
    this.showAlert = false;
  }

  viewSolution() {
    this.userService.raiseHeartBeatEvent(eventName.viewSolutionClicked, TelemetryType.interact, this.car.getCurrentSlideIndex());
    this.showSolution = true;
    this.showAlert = false;
    clearTimeout(this.intervalRef);
  }

  exitContent(event) {
    if (event.type === 'EXIT') {
      this.userService.raiseHeartBeatEvent(eventName.endPageExitClicked, TelemetryType.interact, 'endPage')
      this.userService.raiseEndEvent(this.currentSlideIndex, this.currentSlideIndex - 1, 'endPage');
    }
  }

  closeSolution() {
    this.userService.raiseHeartBeatEvent(eventName.solutionClosed, TelemetryType.interact, this.car.getCurrentSlideIndex());
    this.showSolution = false;
    this.car.selectSlide(this.currentSlideIndex);
  }

  async validateSelectedOption(option) {
    const selectedOptionValue = option ? option.option.value : undefined;
    const currentIndex = this.car.getCurrentSlideIndex() - 1;
    let updated = false;
    if (this.optionSelectedObj !== undefined) {
      let key: any = await this.utilService.getKeyValue(Object.keys(this.questions[currentIndex].responseDeclaration));
      const correctOptionValue = this.questions[currentIndex].responseDeclaration[key].correctResponse.value;
      this.currentQuestion = this.questions[currentIndex].body;
      this.currentOptions = this.questions[currentIndex].interactions.response1.options;
      if (Boolean(option.option.value == correctOptionValue)) {
        this.currentScore = this.getScore(currentIndex , key);
        this.showAlert = true;
        this.alertType = true;
        this.updateScoreBoard(currentIndex + 1, 'attempted', selectedOptionValue , this.currentScore);
        this.correctFeedBackTimeOut();
        if (!this.showFeedBack) {
          this.nextSlide();
        }
        if (this.showFeedBack) {
          this.updateScoreBoard(((currentIndex + 1)), 'correct' , undefined , this.currentScore);
        }
      } else if (!Boolean(option.option.value.value == correctOptionValue)) {
        this.showAlert = true;
        this.alertType = false;
        if (this.showFeedBack) {
          this.updateScoreBoard((currentIndex + 1), 'wrong');
        }
        if (!this.showFeedBack) {
          this.nextSlide();
        }
      }
      this.optionSelectedObj = undefined;
    } else if (this.optionSelectedObj === undefined && !this.active) {
      this.nextSlide();
    } else if (this.optionSelectedObj === undefined && this.active) {
      this.nextSlide();
    }
  }



  updateScoreBoard(index, classToBeUpdated, optionValue? , score?) {
    if (this.showFeedBack) {
      this.progressBarClass.forEach((ele) => {
        if (ele.index === index) {
          ele.class = classToBeUpdated;
          ele.score = score ? score : 0 
          ele.qType = this.questions[index - 1].primaryCategory.toLowerCase() === 'multiple choice question' ? 'MCQ' : 'SA';
        }
      })
    } else if (!this.showFeedBack) {
      this.progressBarClass.forEach((ele) => {
        if (ele.index === index) {
          ele.class = classToBeUpdated;
          ele.score = score ? score : 0;
          ele.value = optionValue
        }
      })
    }
  }

  calculateScore(){
    this.progressBarClass.forEach((ele) =>{
      this.finalScore = this.finalScore + ele.score;
    })
  }

  correctFeedBackTimeOut() {
    this.intervalRef = setTimeout(() => {
      this.showAlert = false;
      if (!this.car.isLast(this.car.getCurrentSlideIndex())) {
        this.car.move(this.CarouselConfig.NEXT);
      } else if (this.car.isLast(this.car.getCurrentSlideIndex())) {
        this.endPageReached = true;
      }
    }, 3000)
  }

  nextSlideClicked(event) {
    if (event.type === 'next') {
      this.validateSelectedOption(this.optionSelectedObj);
    }
  }

  previousSlideClicked(event) {
    if (event = 'previous clicked') {
      this.prevSlide();
    }
  }

  replayContent() {
    this.userService.raiseHeartBeatEvent(eventName.replayClicked, TelemetryType.interact, this.car.getCurrentSlideIndex());
    this.userService.raiseStartEvent(this.car.getCurrentSlideIndex());
    this.endPageReached = false;
    this.loadScoreBoard = false;
    this.currentSlideIndex = 1;
    this.car.selectSlide(1);
  }

  inScoreBoardSubmitClicked() {
    this.userService.raiseHeartBeatEvent(eventName.scoreBoardSubmitClicked, TelemetryType.interact, pageId.submitPage);
    this.endPageReached = true;
  }

  goToSlide(index) {
    if (index === 0) {
      this.optionSelectedObj = undefined;
    }
    if (this.loadScoreBoard) {
      this.loadScoreBoard = false;
    }
    this.currentSlideIndex = index;
    this.car.selectSlide(index);
  }

  scoreBoardSubmitClicked(event) {
    if (event.type = 'submit-clicked') {
      this.endPageReached = true;
    }
  }

  setInitialScores() {
    if (this.showFeedBack) {
      this.questions.forEach((ele, index) => {
        this.progressBarClass.push({
          index: (index + 1), class: 'skipped',
          score: 0,
          qType: this.questions[index].primaryCategory.toLowerCase() === 'multiple choice question' ? 'MCQ' : 'SA'
        });
      })
    } else if (!this.showFeedBack) {
      this.questions.forEach((ele, index) => {
        this.progressBarClass.push({
          index: (index + 1), class: 'unattempted', value: undefined,
          score: 0,
          qType: this.questions[index].primaryCategory.toLowerCase() === 'multiple choice question' ? 'MCQ' : 'SA'
        });
      })
    }
  }

  goToQuestion(event) {
    this.car.selectSlide(event.questionNo);
    this.loadScoreBoard = false;
  }

  getSolutions() {
    const currentIndex = this.car.getCurrentSlideIndex() - 1;
    this.currentQuestion = this.questions[currentIndex].body;
    this.currentOptions = this.questions[currentIndex].interactions.response1.options;
    if (this.currentSolutions) {
      this.showSolution = true;
    }
    if (this.intervalRef) {
      clearInterval(this.intervalRef)
    }
  }

  getScore(currentIndex , key){
    return this.questions[currentIndex].responseDeclaration.maxScore ? this.questions[currentIndex].responseDeclaration.maxScore : this.questions[currentIndex].responseDeclaration[key].correctResponse.outcomes;
  }
}
