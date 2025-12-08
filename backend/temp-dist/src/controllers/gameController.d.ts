import { Request, Response } from 'express';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
export declare function getPrizeForLevel(level: number): number;
export declare class GameController {
    private questionModel;
    private db;
    private io;
    private getPrizeForLevel;
    private advanceToNextQuestion;
    private getConsistentOptions;
    constructor(dbPool: Pool, io: SocketIOServer);
    createGame(req: Request, res: Response): Promise<void>;
    joinGame(req: Request, res: Response): Promise<void>;
    startGame(req: Request, res: Response): Promise<void>;
    handleAnswer(req: Request, res: Response): Promise<void>;
    getQuestions(req: Request, res: Response): Promise<void>;
    getGameById(req: Request, res: Response): Promise<void>;
    getCurrentQuestion(req: Request, res: Response): Promise<void>;
    submitAnswer(req: Request, res: Response): Promise<void>;
    getActiveGames(req: Request, res: Response): Promise<void>;
    getGameState(req: Request, res: Response): Promise<void>;
    getPlayers(req: Request, res: Response): Promise<void>;
    private getQuestionForLevel;
}
